/**
 * mesh:pits — Degassing pits (flat-bottomed cylindrical depressions).
 *
 * Unlike craters: no rim, no ejecta, steep vertical walls, flat floor.
 * Seen on comets (67P Churyumov-Gerasimenko) and carbonaceous asteroids.
 */

import {
  type MeshData,
  type MeshModifier,
  computeTriangleAreas,
  computeVertexNormals,
  pickRandomSurfacePoint,
  getMeshRadius,
  ensureOccupancy,
  ensureFeatureData2,
} from "./meshModifiers";
import { mulberry32 } from "./prng";

export interface PitParams {
  count: number;
  minSize: number;
  maxSize: number;
  depth: number;
  wallSteepness: number;
  seed: number;
}

const DEFAULTS: PitParams = {
  count: 50,
  minSize: 0.01,
  maxSize: 0.06,
  depth: 0.15,
  wallSteepness: 0.7,
  seed: 1,
};

export const pitModifier: MeshModifier = {
  name: "mesh:pits",

  apply(mesh: MeshData, rawParams: Record<string, number | string | boolean>): MeshData {
    const p: PitParams = { ...DEFAULTS };
    if (rawParams.count !== undefined) p.count = Math.round(Number(rawParams.count));
    if (rawParams.minSize !== undefined) p.minSize = Number(rawParams.minSize);
    if (rawParams.maxSize !== undefined) p.maxSize = Number(rawParams.maxSize);
    if (rawParams.depth !== undefined) p.depth = Number(rawParams.depth);
    if (rawParams.wallSteepness !== undefined) p.wallSteepness = Number(rawParams.wallSteepness);
    if (rawParams.seed !== undefined) p.seed = Number(rawParams.seed);

    if (p.count <= 0) return mesh;

    const rand = mulberry32(p.seed + 9001);
    const meshRadius = getMeshRadius(mesh);
    const areas = computeTriangleAreas(mesh);
    const totalArea = areas.reduce((s, a) => s + a, 0);

    const positions = new Float64Array(mesh.positions);
    const occupancy = ensureOccupancy(mesh);
    const featureData2 = ensureFeatureData2(mesh);

    // Plan pit placements
    interface PitPlacement {
      center: [number, number, number];
      normal: [number, number, number];
      radius: number;
    }

    const pits: PitPlacement[] = [];
    const maxAttempts = p.count * 4;
    let attempts = 0;

    while (pits.length < p.count && attempts < maxAttempts) {
      attempts++;
      const u = rand();
      const sizeFrac = p.minSize + (p.maxSize - p.minSize) * Math.pow(u, 1.5);
      const radius = sizeFrac * meshRadius;
      const { point, normal } = pickRandomSurfacePoint(mesh, areas, totalArea, rand);

      // Check overlap
      let overlap = false;
      for (const existing of pits) {
        const dx = point[0] - existing.center[0];
        const dy = point[1] - existing.center[1];
        const dz = point[2] - existing.center[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < (radius + existing.radius) * 0.9) {
          overlap = true;
          break;
        }
      }
      if (overlap) continue;

      pits.push({ center: point, normal, radius });
    }

    // Apply pits to vertices
    for (const pit of pits) {
      const [cx, cy, cz] = pit.center;
      const [nx, ny, nz] = pit.normal;
      const r = pit.radius;
      const depthAbs = p.depth * r;
      // flatRadius: portion of pit that is flat-bottomed
      const flatRadius = 1.0 - p.wallSteepness * 0.4;

      for (let i = 0; i < mesh.vertexCount; i++) {
        const vx = positions[i * 3]!;
        const vy = positions[i * 3 + 1]!;
        const vz = positions[i * 3 + 2]!;

        const dx = vx - cx;
        const dy = vy - cy;
        const dz = vz - cz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist > r) continue;

        const t = dist / r; // 0 at center, 1 at edge

        // Displacement profile: flat bottom → steep wall → surface
        let disp: number;
        if (t < flatRadius) {
          // Flat bottom: constant depth
          disp = -depthAbs;
        } else {
          // Steep wall transition
          const wallT = (t - flatRadius) / (1.0 - flatRadius);
          // Smooth but steep transition
          const steepness = 1.0 + p.wallSteepness * 3.0;
          disp = -depthAbs * Math.pow(1.0 - wallT, steepness);
        }

        // Apply displacement along surface normal
        positions[i * 3] += nx * disp;
        positions[i * 3 + 1] += ny * disp;
        positions[i * 3 + 2] += nz * disp;

        // Mark occupancy
        if (Math.abs(disp) > occupancy[i]!) {
          occupancy[i] = Math.abs(disp);
        }

        // Feature data: pits in featureData2 G channel ([fi+1])
        const intensity = 1.0 - t;
        const fi = i * 4;
        featureData2[fi + 1] = Math.max(featureData2[fi + 1]!, intensity);
      }
    }

    const normals = computeVertexNormals(positions, mesh.indices, mesh.vertexCount);

    return {
      ...mesh,
      positions,
      normals,
      occupancy,
      featureData2,
    };
  },
};
