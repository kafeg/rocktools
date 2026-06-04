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

  // Two calibres so the ground reads naturally: a few boulders + lots of pebbles.
  const place = (count: number, sizeMul: number) => {
    for (let k = 0; k < count; k++) {
      const x = (rand() - 0.5) * 2 * margin;
      const z = (rand() - 0.5) * 2 * margin;
      const u = rand();
      const scale = (params.minSize + (params.maxSize - params.minSize) * u * u) * size * sizeMul;
      const baseY = sampleHeight(field, x, z);
      const [nx, ny, nz] = sampleNormal(field, x, z);
      instances.push({
        x,
        y: baseY - params.embed * scale,
        z,
        scale,
        rotY: rand() * Math.PI * 2,
        nx, ny, nz,
        templateIdx: Math.floor(rand() * templates.length),
      });
    }
  };

  place(params.count, 1.0);          // boulders
  place(params.count * 3, 0.35);     // pebbles / gravel

  return { templates, instances };
}
