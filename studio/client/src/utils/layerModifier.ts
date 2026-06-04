import {
  type MeshData,
  type MeshModifier,
  computeVertexNormals,
  getMeshRadius,
  ensureOccupancy,
  ensureFeatureData,
} from "./meshModifiers";
import { mulberry32 } from "./prng";

export interface LayerParams {
  layers: number;
  displacement: number;
  noise: number;
  sharpness: number;
  seed: number;
}

const DEFAULTS: LayerParams = {
  layers: 5,
  displacement: 0.02,
  noise: 0.3,
  sharpness: 0.5,
  seed: 1,
};

// Integer-lattice hash → [0,1). Only sampled at integer corners, so the
// trilinear interpolation below makes the field spatially SMOOTH (the old code
// hashed the raw coords, i.e. white noise, which made neighbouring vertices
// land in different layer bands and produced vertical spikes).
function hash3(ix: number, iy: number, iz: number, seed: number): number {
  const n = Math.sin(ix * 12.9898 + iy * 78.233 + iz * 45.164 + seed * 93.1) * 43758.5453;
  return n - Math.floor(n);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Smooth trilinear value noise in [-1, 1]. */
function valueNoise3d(x: number, y: number, z: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = smooth(fx), uy = smooth(fy), uz = smooth(fz);
  const c = (dx: number, dy: number, dz: number) => hash3(ix + dx, iy + dy, iz + dz, seed);
  const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * ux;
  const x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * ux;
  const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * ux;
  const x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * ux;
  const y0 = x00 + (x10 - x00) * uy;
  const y1 = x01 + (x11 - x01) * uy;
  return ((y0 + (y1 - y0) * uz) * 2 - 1);
}

function fbm3d(x: number, y: number, z: number, seed: number, octaves: number): number {
  let val = 0;
  let amp = 1;
  let freq = 1;
  let totalAmp = 0;
  for (let i = 0; i < octaves; i++) {
    val += amp * valueNoise3d(x * freq, y * freq, z * freq, seed + i * 7.3);
    totalAmp += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return totalAmp > 0 ? val / totalAmp : 0;
}

export const layerModifier: MeshModifier = {
  name: "mesh:layers",

  apply(mesh: MeshData, rawParams: Record<string, number | string | boolean>): MeshData {
    const p: LayerParams = { ...DEFAULTS };
    if (rawParams.layers !== undefined) p.layers = Number(rawParams.layers);
    if (rawParams.displacement !== undefined) p.displacement = Number(rawParams.displacement);
    if (rawParams.noise !== undefined) p.noise = Number(rawParams.noise);
    if (rawParams.sharpness !== undefined) p.sharpness = Number(rawParams.sharpness);
    if (rawParams.seed !== undefined) p.seed = Number(rawParams.seed);

    if (p.layers <= 1) return mesh;

    const rand = mulberry32(p.seed);
    const meshRadius = getMeshRadius(mesh);
    const dispMag = p.displacement * meshRadius;
    const occupancy = ensureOccupancy(mesh);
    const featureData = ensureFeatureData(mesh);

    const layers = Math.max(2, Math.round(p.layers));
    // Per-seed phase offset so different seeds get different band positions.
    const phaseOffset = rand();
    // Sharpness pushes the smooth sine toward flatter plateaus with rounded
    // steps, but the displacement ALWAYS stays continuous across band borders
    // (a continuous function of radius), so no opposite-sign neighbours / spikes.
    const k = 1 + p.sharpness * 6;
    const tanhK = Math.tanh(k);

    const newPositions = new Float64Array(mesh.positions);

    for (let vi = 0; vi < mesh.vertexCount; vi++) {
      const vx = newPositions[vi * 3]!;
      const vy = newPositions[vi * 3 + 1]!;
      const vz = newPositions[vi * 3 + 2]!;

      const r = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (r < 1e-10) continue;

      const noiseVal = p.noise > 0
        ? fbm3d(vx * 3 / meshRadius, vy * 3 / meshRadius, vz * 3 / meshRadius, p.seed, 3)
        : 0;
      const perturbedR = r + noiseVal * p.noise * meshRadius * 0.1;

      // Continuous terrace wave along radius. sin → C∞; tanh shaping keeps it
      // continuous while sharpening the steps. Neighbours always get close
      // values, so the mesh stays smooth.
      const phase = (perturbedR / meshRadius) * layers + phaseOffset;
      const s = Math.tanh(Math.sin(phase * Math.PI) * k) / tanhK; // [-1, 1]
      const displacement = s * dispMag;

      if (Math.abs(displacement) > 1e-10) {
        const nx = mesh.normals[vi * 3]!;
        const ny = mesh.normals[vi * 3 + 1]!;
        const nz = mesh.normals[vi * 3 + 2]!;
        newPositions[vi * 3] += nx * displacement;
        newPositions[vi * 3 + 1] += ny * displacement;
        newPositions[vi * 3 + 2] += nz * displacement;

        occupancy[vi] = Math.max(occupancy[vi]!, Math.abs(displacement));
        // Layer-edge highlight (for shader banding) peaks where s≈0 (band border).
        const fi = vi * 4;
        featureData[fi + 3] = Math.max(featureData[fi + 3]!, 1.0 - Math.min(Math.abs(s) * 2.0, 1.0));
      }
    }

    const normals = computeVertexNormals(newPositions, mesh.indices, mesh.vertexCount);
    return { ...mesh, positions: newPositions, normals, occupancy, featureData };
  },
};
