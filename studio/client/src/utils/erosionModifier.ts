/**
 * mesh:erosion — Curvature-driven erosion.
 *
 * Simulates micrometeorite bombardment erosion:
 * - Convex areas (peaks, ridges) get smoothed/eroded
 * - Concave areas (valleys, craters) can be sharpened or preserved
 *
 * Uses discrete Laplacian curvature estimation per vertex.
 */

import {
  type MeshData,
  type MeshModifier,
  computeVertexNormals,
  buildAdjacency,
  getMeshRadius,
} from "./meshModifiers";

export interface ErosionParams {
  intensity: number;
  passes: number;
  curvatureBias: number;
  seed: number;
}

const DEFAULTS: ErosionParams = {
  intensity: 0.3,
  passes: 2,
  curvatureBias: 0.5,
  seed: 1,
};

export const erosionModifier: MeshModifier = {
  name: "mesh:erosion",

  apply(mesh: MeshData, rawParams: Record<string, number | string | boolean>): MeshData {
    const p: ErosionParams = { ...DEFAULTS };
    if (rawParams.intensity !== undefined) p.intensity = Number(rawParams.intensity);
    if (rawParams.passes !== undefined) p.passes = Math.max(1, Math.min(5, Math.round(Number(rawParams.passes))));
    if (rawParams.curvatureBias !== undefined) p.curvatureBias = Number(rawParams.curvatureBias);
    if (rawParams.seed !== undefined) p.seed = Number(rawParams.seed);

    if (p.intensity <= 0 || p.passes <= 0) return mesh;

    const meshRadius = getMeshRadius(mesh);
    const positions = new Float64Array(mesh.positions);
    const adj = buildAdjacency(mesh.indices, mesh.vertexCount);

    // Maximum displacement per pass (fraction of mesh radius)
    const maxDisp = meshRadius * p.intensity * 0.02;

    for (let pass = 0; pass < p.passes; pass++) {
      const normals = computeVertexNormals(positions, mesh.indices, mesh.vertexCount);

      // Compute per-vertex Laplacian vector and signed curvature
      const displacements = new Float64Array(mesh.vertexCount);

      for (let i = 0; i < mesh.vertexCount; i++) {
        const neighbors = adj[i]!;
        if (neighbors.length === 0) continue;

        const vx = positions[i * 3]!;
        const vy = positions[i * 3 + 1]!;
        const vz = positions[i * 3 + 2]!;

        // Laplacian: average of neighbors minus vertex position
        let lx = 0, ly = 0, lz = 0;
        for (const j of neighbors) {
          lx += positions[j * 3]!;
          ly += positions[j * 3 + 1]!;
          lz += positions[j * 3 + 2]!;
        }
        const n = neighbors.length;
        lx = lx / n - vx;
        ly = ly / n - vy;
        lz = lz / n - vz;

        // Signed curvature: dot(laplacian, normal)
        // Positive = concave (valleys), Negative = convex (peaks)
        const nx = normals[i * 3]!;
        const ny = normals[i * 3 + 1]!;
        const nz = normals[i * 3 + 2]!;
        const curvature = lx * nx + ly * ny + lz * nz;

        // Bias factor: 0 = symmetric erosion, 1 = only sharpen concavities
        // curvature > 0 → concave → preserve/sharpen (reduce displacement when bias high)
        // curvature < 0 → convex → erode (always apply)
        let biasFactor: number;
        if (curvature > 0) {
          // Concave: with high bias, reduce the smoothing effect
          biasFactor = 1.0 - p.curvatureBias * 0.8;
        } else {
          // Convex: always erode, with high bias erode more aggressively
          biasFactor = 1.0 + p.curvatureBias * 0.3;
        }

        const disp = Math.max(-maxDisp, Math.min(maxDisp, curvature * biasFactor));
        displacements[i] = disp;
      }

      // Apply displacements along normals
      const normals2 = computeVertexNormals(positions, mesh.indices, mesh.vertexCount);
      for (let i = 0; i < mesh.vertexCount; i++) {
        const d = displacements[i]!;
        if (Math.abs(d) < 1e-12) continue;
        positions[i * 3] += normals2[i * 3]! * d;
        positions[i * 3 + 1] += normals2[i * 3 + 1]! * d;
        positions[i * 3 + 2] += normals2[i * 3 + 2]! * d;
      }
    }

    const finalNormals = computeVertexNormals(positions, mesh.indices, mesh.vertexCount);

    return {
      ...mesh,
      positions,
      normals: finalNormals,
    };
  },
};
