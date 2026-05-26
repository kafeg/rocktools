import {
  type MeshData,
  type MeshModifier,
  computeTriangleAreas,
  computeVertexNormals,
  pickRandomSurfacePoint,
  getMeshRadius,
  ensureOccupancy,
  ensureFeatureData,
  buildAdjacency,
} from "./meshModifiers";
import { mulberry32 } from "./prng";

export interface BoulderParams {
  count: number;
  minSize: number;
  maxSize: number;
  height: number;
  roughness: number;
  smoothing: number;
  avoidOverlap: boolean;
  seed: number;
}

const DEFAULTS: BoulderParams = {
  count: 12,
  minSize: 0.02,
  maxSize: 0.08,
  height: 0.6,
  roughness: 0.4,
  smoothing: 1,
  avoidOverlap: true,
  seed: 1,
};

export const boulderModifier: MeshModifier = {
  name: "mesh:boulders",

  apply(mesh: MeshData, rawParams: Record<string, number | string | boolean>): MeshData {
    const p: BoulderParams = { ...DEFAULTS };
    if (rawParams.count !== undefined) p.count = Number(rawParams.count);
    if (rawParams.minSize !== undefined) p.minSize = Number(rawParams.minSize);
    if (rawParams.maxSize !== undefined) p.maxSize = Number(rawParams.maxSize);
    if (rawParams.height !== undefined) p.height = Number(rawParams.height);
    if (rawParams.roughness !== undefined) p.roughness = Number(rawParams.roughness);
    if (rawParams.smoothing !== undefined) p.smoothing = Math.round(Number(rawParams.smoothing));
    if (rawParams.avoidOverlap !== undefined) p.avoidOverlap = rawParams.avoidOverlap === true || rawParams.avoidOverlap === "true";
    if (rawParams.seed !== undefined) p.seed = Number(rawParams.seed);

    if (p.count <= 0) return mesh;

    const rand = mulberry32(p.seed);
    const meshRadius = getMeshRadius(mesh);
    const areas = computeTriangleAreas(mesh);
    const totalArea = areas.reduce((s, a) => s + a, 0);
    const occupancy = ensureOccupancy(mesh);
    const featureData = ensureFeatureData(mesh);

    interface Boulder {
      center: [number, number, number];
      normal: [number, number, number];
      radius: number;
      peakHeight: number;
      irregularity: number[];
    }

    const boulders: Boulder[] = [];
    for (let i = 0; i < p.count; i++) {
      const u = rand();
      const size = p.minSize + (p.maxSize - p.minSize) * Math.pow(u, 2);
      const radius = size * meshRadius;

      const { point, normal } = pickRandomSurfacePoint(mesh, areas, totalArea, rand);

      const lobes: number[] = [];
      for (let l = 0; l < 8; l++) {
        lobes.push(1.0 - p.roughness * 0.5 + p.roughness * rand());
      }

      boulders.push({
        center: point,
        normal,
        radius,
        peakHeight: radius * p.height,
        irregularity: lobes,
      });
    }

    const maxPeakHeight = boulders.reduce((m, b) => Math.max(m, b.peakHeight), 0);
    const dispClamp = maxPeakHeight * 1.5;
    const newPositions = new Float64Array(mesh.positions);
    const affected = new Uint8Array(mesh.vertexCount);

    for (let vi = 0; vi < mesh.vertexCount; vi++) {
      const vx = newPositions[vi * 3]!;
      const vy = newPositions[vi * 3 + 1]!;
      const vz = newPositions[vi * 3 + 2]!;

      if (p.avoidOverlap && occupancy[vi]! > meshRadius * 0.01) continue;

      let totalDisplacement = 0;

      for (const boulder of boulders) {
        const dx = vx - boulder.center[0];
        const dy = vy - boulder.center[1];
        const dz = vz - boulder.center[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const t = dist / boulder.radius;

        if (t >= 1.5) continue;

        const dot = dx * boulder.normal[0] + dy * boulder.normal[1] + dz * boulder.normal[2];
        const angle = Math.atan2(dy - boulder.normal[1] * dot, dx - boulder.normal[0] * dot);
        const lobeIdx = ((angle / (2 * Math.PI) + 0.5) * boulder.irregularity.length) % boulder.irregularity.length;
        const li = Math.floor(lobeIdx);
        const lf = lobeIdx - li;
        const lobeScale = boulder.irregularity[li % boulder.irregularity.length]! * (1 - lf)
                        + boulder.irregularity[(li + 1) % boulder.irregularity.length]! * lf;

        const effectiveT = t / lobeScale;
        if (effectiveT >= 1.0) continue;

        const profileH = Math.cos(effectiveT * Math.PI * 0.5);
        const raised = profileH * profileH;
        totalDisplacement += boulder.peakHeight * raised;
      }

      totalDisplacement = Math.min(totalDisplacement, dispClamp);

      if (totalDisplacement > 1e-10) {
        const nx = mesh.normals[vi * 3]!;
        const ny = mesh.normals[vi * 3 + 1]!;
        const nz = mesh.normals[vi * 3 + 2]!;
        newPositions[vi * 3] += nx * totalDisplacement;
        newPositions[vi * 3 + 1] += ny * totalDisplacement;
        newPositions[vi * 3 + 2] += nz * totalDisplacement;

        affected[vi] = 1;
        occupancy[vi] = Math.max(occupancy[vi]!, totalDisplacement);
        const fi = vi * 4;
        featureData[fi + 1] = Math.max(featureData[fi + 1]!, Math.min(totalDisplacement / (meshRadius * 0.05), 1.0));
      }
    }

    if (p.smoothing > 0) {
      const adj = buildAdjacency(mesh.indices, mesh.vertexCount);
      for (let pass = 0; pass < p.smoothing; pass++) {
        const smoothed = new Float64Array(newPositions);
        for (let vi = 0; vi < mesh.vertexCount; vi++) {
          if (!affected[vi]) continue;
          const neighbors = adj[vi]!;
          if (neighbors.length === 0) continue;
          let sx = 0, sy = 0, sz = 0;
          for (const ni of neighbors) {
            sx += newPositions[ni * 3]!;
            sy += newPositions[ni * 3 + 1]!;
            sz += newPositions[ni * 3 + 2]!;
          }
          const n = neighbors.length;
          const lambda = 0.5;
          smoothed[vi * 3] = newPositions[vi * 3]! * (1 - lambda) + (sx / n) * lambda;
          smoothed[vi * 3 + 1] = newPositions[vi * 3 + 1]! * (1 - lambda) + (sy / n) * lambda;
          smoothed[vi * 3 + 2] = newPositions[vi * 3 + 2]! * (1 - lambda) + (sz / n) * lambda;
        }
        for (let vi = 0; vi < mesh.vertexCount; vi++) {
          if (!affected[vi]) continue;
          newPositions[vi * 3] = smoothed[vi * 3]!;
          newPositions[vi * 3 + 1] = smoothed[vi * 3 + 1]!;
          newPositions[vi * 3 + 2] = smoothed[vi * 3 + 2]!;
        }
      }
    }

    const normals = computeVertexNormals(newPositions, mesh.indices, mesh.vertexCount);
    return { ...mesh, positions: newPositions, normals, occupancy, featureData };
  },
};
