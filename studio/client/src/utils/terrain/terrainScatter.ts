/**
 * Deterministic rock scatter.
 *
 * Unlike the asteroid mesh:rocks modifier (which MERGES rock geometry into the
 * host mesh — expensive and the source of the false "self-intersecting" errors),
 * terrain rocks are kept as lightweight INSTANCES: a handful of template meshes
 * placed thousands of times via per-instance transforms. This decouples rock
 * count from the terrain vertex count entirely, so we can scatter many rocks
 * cheaply. Rendering uses THREE.InstancedMesh; GLB export bakes the instances.
 */

import type { MeshData } from "../meshModifiers";
import { generateRockTemplate } from "../rockModifier";
import { deriveSeed, mulberry32 } from "../prng";
import { sampleHeight, sampleNormal, type TerrainField } from "./terrainField";
import { makeNoise2D, fbm } from "./noise";
import type { RockStyle } from "./terrainStyle";

export interface RockInstance {
  /** World position (rock sits on the terrain surface). */
  x: number;
  y: number;
  z: number;
  /** Uniform scale (world units). */
  scale: number;
  /** Yaw around the surface normal. */
  rotY: number;
  /** Surface normal at the placement (rocks tilt to lie on slopes). */
  nx: number;
  ny: number;
  nz: number;
  /** Index into the templates array. */
  templateIdx: number;
}

export interface TerrainScatter {
  templates: MeshData[];
  instances: RockInstance[];
}

export interface ScatterParams {
  /** Number of rock instances to place. */
  count: number;
  /** Min/max rock size as a fraction of footprint. */
  minSize: number;
  maxSize: number;
  /** How deep rocks sit into the surface (fraction of their size). */
  embed: number;
  /**
   * TALUS / SCREE strength (0 = off). Adds extra small debris pooling at the FOOT
   * of steep ground (mountain bases, scarp bottoms) — where the cell is gentle but
   * a wall rises just uphill. Rolled per-site by the generator.
   */
  talus?: number;
}

export function scatterRocks(
  field: TerrainField,
  style: RockStyle,
  params: ScatterParams,
  seed: number,
): TerrainScatter {
  const templates: MeshData[] = [];
  for (let t = 0; t < style.templates; t++) {
    templates.push(generateRockTemplate(deriveSeed(seed, 0x520c, t), style.roughness, style.detail));
  }

  const rand = mulberry32(seed);
  const size = field.size;
  const margin = size * 0.48; // keep rocks inside the footprint
  const instances: RockInstance[] = [];

  // CLUSTERING: a low-frequency density field so rocks gather into BOULDER FIELDS
  // with genuinely clear ground between them, instead of a uniform sprinkle — a
  // more natural, varied scatter. `clump` (per calibre) sets how hard it pools.
  const nClump = makeNoise2D(seed ^ 0x2f9a1c7b);
  const clumpOpts = { octaves: 2, lacunarity: 2, persistence: 0.5, frequency: 3.0 / size };

  // sizeMul scales the calibre; embedMul deepens small debris; flatBias>0 makes
  // the calibre pool in flatter areas (scree/gravel accumulates where material
  // settles, not on steep faces); clump>0 gathers it into fields.
  const place = (count: number, sizeMul: number, embedMul: number, flatBias: number, clump: number) => {
    for (let k = 0; k < count; k++) {
      const x = (rand() - 0.5) * 2 * margin;
      const z = (rand() - 0.5) * 2 * margin;
      const u = rand();
      const [nx, ny, nz] = sampleNormal(field, x, z);
      // Reject (deterministically) on slopes for biased calibres → gravel fields.
      if (flatBias > 0) {
        const flatness = Math.max(0, ny); // 1 = flat, →0 = steep
        if (rand() > Math.pow(flatness, flatBias)) continue;
      }
      // Reject in the low-density gaps of the clustering field → boulder fields.
      if (clump > 0) {
        const c = fbm(nClump, x, z, clumpOpts) * 0.5 + 0.5; // 0..1
        if (rand() > Math.pow(c, clump)) continue;
      }
      // Quartic bias (u⁴) toward minSize: across the WIDE min→max range the field
      // is dominated by small pebbles with only the rare large boulder — a stronger
      // skew to small than u³, per the "far more small than big" intent.
      const scale = (params.minSize + (params.maxSize - params.minSize) * u * u * u * u) * size * sizeMul;
      const baseY = sampleHeight(field, x, z);
      instances.push({
        x,
        y: baseY - params.embed * embedMul * scale,
        z,
        scale,
        rotY: rand() * Math.PI * 2,
        nx, ny, nz,
        templateIdx: Math.floor(rand() * templates.length),
      });
    }
  };

  place(params.count, 1.0, 1.0, 0, 2.2);        // boulders — gather into fields
  place(params.count * 3, 0.35, 1.0, 0, 1.3);   // pebbles — mildly clustered
  place(params.count * 8, 0.12, 1.6, 3, 0);     // fine gravel — pools in flats, spread

  // TALUS / SCREE APRONS: small debris shed from steep faces, piling on the gentle
  // ground directly BELOW them. A candidate is kept only where the cell itself is
  // gentle (scree settles, doesn't cling to the wall) AND a steep RISE sits within
  // a short uphill probe (the wall it fell from) — so aprons hug mountain feet and
  // scarp bottoms, not open plains.
  const talus = params.talus ?? 0;
  if (talus > 0) {
    const probe = size * 0.03;
    const talusCount = Math.round(params.count * 10 * talus);
    for (let k = 0; k < talusCount; k++) {
      const x = (rand() - 0.5) * 2 * margin;
      const z = (rand() - 0.5) * 2 * margin;
      const [nx, ny, nz] = sampleNormal(field, x, z);
      if (Math.max(0, ny) < 0.7) continue; // must be gentle ground (the apron)
      const h0 = sampleHeight(field, x, z);
      let maxRise = 0;
      for (let a = 0; a < 4; a++) {
        const ang = (Math.PI / 2) * a;
        const rise = sampleHeight(field, x + Math.cos(ang) * probe, z + Math.sin(ang) * probe) - h0;
        if (rise > maxRise) maxRise = rise;
      }
      const apron = Math.min(1, maxRise / (probe * 0.6)); // 0 = no wall → 1 = tall wall
      if (rand() > Math.pow(apron, 1.5)) continue;
      const u = rand();
      const scale = (params.minSize + (params.maxSize - params.minSize) * u * u * u * u) * size * 0.28;
      const baseY = sampleHeight(field, x, z);
      instances.push({
        x, y: baseY - params.embed * 1.4 * scale, z, scale,
        rotY: rand() * Math.PI * 2, nx, ny, nz,
        templateIdx: Math.floor(rand() * templates.length),
      });
    }
  }

  return { templates, instances };
}
