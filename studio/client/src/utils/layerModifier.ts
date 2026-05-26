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

function noise3d(x: number, y: number, z: number, seed: number): number {
  const n = Math.sin(x * 12.9898 + y * 78.233 + z * 45.164 + seed * 93.1) * 43758.5453;
  return n - Math.floor(n);
}

function fbm3d(x: number, y: number, z: number, seed: number, octaves: number): number {
  let val = 0;
  let amp = 1;
  let freq = 1;
  let totalAmp = 0;
  for (let i = 0; i < octaves; i++) {
    val += amp * (noise3d(x * freq, y * freq, z * freq, seed + i * 7.3) * 2 - 1);
    totalAmp += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return val / totalAmp;
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

    const layerDisplacements: number[] = [];
    for (let i = 0; i < p.layers; i++) {
      const sign = (i % 2 === 0) ? -1 : 1;
      layerDisplacements.push(sign * dispMag * (0.5 + rand() * 0.5));
    }

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

      const layerFloat = (perturbedR / meshRadius) * p.layers;
      const layerIdx = Math.floor(layerFloat) % p.layers;
      const layerFrac = layerFloat - Math.floor(layerFloat);

      let blendFactor: number;
      if (p.sharpness >= 0.99) {
        blendFactor = 1.0;
      } else {
        const edgeDist = Math.min(layerFrac, 1.0 - layerFrac);
        const transWidth = 0.5 * (1.0 - p.sharpness);
        blendFactor = edgeDist < transWidth
          ? edgeDist / transWidth
          : 1.0;
      }

      const displacement = layerDisplacements[layerIdx % layerDisplacements.length]! * blendFactor;

      if (Math.abs(displacement) > 1e-10) {
        const nx = mesh.normals[vi * 3]!;
        const ny = mesh.normals[vi * 3 + 1]!;
        const nz = mesh.normals[vi * 3 + 2]!;
        newPositions[vi * 3] += nx * displacement;
        newPositions[vi * 3 + 1] += ny * displacement;
        newPositions[vi * 3 + 2] += nz * displacement;

        occupancy[vi] = Math.max(occupancy[vi]!, Math.abs(displacement));
        const edgeDist = Math.min(layerFrac, 1.0 - layerFrac);
        const fi = vi * 4;
        featureData[fi + 3] = Math.max(featureData[fi + 3]!, 1.0 - Math.min(edgeDist * 4.0, 1.0));
      }
    }

    const normals = computeVertexNormals(newPositions, mesh.indices, mesh.vertexCount);
    return { ...mesh, positions: newPositions, normals, occupancy, featureData };
  },
};
