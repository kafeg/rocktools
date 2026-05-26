/**
 * mesh:facets — Planar faceting.
 *
 * Places random facet centers on the surface, then projects nearby
 * vertices onto the tangent plane at each center.  Creates flat,
 * diamond-like faces characteristic of Bennu or crystalline asteroids.
 */

import {
  type MeshData,
  type MeshModifier,
  computeTriangleAreas,
  computeVertexNormals,
  pickRandomSurfacePoint,
  getMeshRadius,
  ensureFeatureData2,
} from "./meshModifiers";
import { mulberry32 } from "./prng";

export interface FacetParams {
  count: number;
  size: number;
  flatness: number;
  seed: number;
}

const DEFAULTS: FacetParams = {
  count: 8,
  size: 0.3,
  flatness: 0.7,
  seed: 1,
};

export const facetModifier: MeshModifier = {
  name: "mesh:facets",

  apply(mesh: MeshData, rawParams: Record<string, number | string | boolean>): MeshData {
    const p: FacetParams = { ...DEFAULTS };
    if (rawParams.count !== undefined) p.count = Math.max(1, Math.min(30, Math.round(Number(rawParams.count))));
    if (rawParams.size !== undefined) p.size = Number(rawParams.size);
    if (rawParams.flatness !== undefined) p.flatness = Number(rawParams.flatness);
    if (rawParams.seed !== undefined) p.seed = Number(rawParams.seed);

    if (p.count <= 0 || p.flatness <= 0) return mesh;

    const rand = mulberry32(p.seed + 7001);
    const meshRadius = getMeshRadius(mesh);
    const areas = computeTriangleAreas(mesh);
    const totalArea = areas.reduce((s, a) => s + a, 0);

    const positions = new Float64Array(mesh.positions);
    const featureData2 = ensureFeatureData2(mesh);

    // Place facet centers
    interface FacetCenter {
      center: [number, number, number];
      normal: [number, number, number];
      radius: number;
    }

    const facets: FacetCenter[] = [];
    const maxAttempts = p.count * 5;
    let attempts = 0;

    while (facets.length < p.count && attempts < maxAttempts) {
      attempts++;
      const { point, normal } = pickRandomSurfacePoint(mesh, areas, totalArea, rand);
      const radius = p.size * meshRadius * (0.7 + rand() * 0.6);

      // Avoid placing facet centers too close together
      let tooClose = false;
      for (const existing of facets) {
        const dx = point[0] - existing.center[0];
        const dy = point[1] - existing.center[1];
        const dz = point[2] - existing.center[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < (radius + existing.radius) * 0.5) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      facets.push({ center: point, normal, radius });
    }

    // For each vertex, find the strongest facet influence and project
    // Track per-vertex: best weight and corresponding projected position
    const weights = new Float64Array(mesh.vertexCount); // best weight so far
    const projX = new Float64Array(mesh.vertexCount);
    const projY = new Float64Array(mesh.vertexCount);
    const projZ = new Float64Array(mesh.vertexCount);

    for (const facet of facets) {
      const [cx, cy, cz] = facet.center;
      const [nx, ny, nz] = facet.normal;
      const r = facet.radius;

      for (let i = 0; i < mesh.vertexCount; i++) {
        const vx = positions[i * 3]!;
        const vy = positions[i * 3 + 1]!;
        const vz = positions[i * 3 + 2]!;

        const dx = vx - cx;
        const dy = vy - cy;
        const dz = vz - cz;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

        if (dist > r) continue;

        const t = dist / r;
        // Smooth falloff: strongest at center, zero at edge
        const w = (1.0 - t * t) * (1.0 - t * t); // quartic falloff

        if (w <= weights[i]!) continue; // already have a stronger facet

        // Project vertex onto the facet's tangent plane
        // projectedPos = vertex - normal * dot(vertex - center, normal)
        const dotN = dx * nx + dy * ny + dz * nz;
        const px = vx - nx * dotN;
        const py = vy - ny * dotN;
        const pz = vz - nz * dotN;

        weights[i] = w;
        projX[i] = px;
        projY[i] = py;
        projZ[i] = pz;
      }
    }

    // Blend original positions toward projected positions
    for (let i = 0; i < mesh.vertexCount; i++) {
      const w = weights[i]!;
      if (w <= 0) continue;

      const blend = w * p.flatness;
      positions[i * 3] = positions[i * 3]! * (1.0 - blend) + projX[i]! * blend;
      positions[i * 3 + 1] = positions[i * 3 + 1]! * (1.0 - blend) + projY[i]! * blend;
      positions[i * 3 + 2] = positions[i * 3 + 2]! * (1.0 - blend) + projZ[i]! * blend;

      // Feature data: facets in featureData2 B channel ([fi+2])
      const fi = i * 4;
      featureData2[fi + 2] = Math.max(featureData2[fi + 2]!, w);
    }

    const normals = computeVertexNormals(positions, mesh.indices, mesh.vertexCount);

    return {
      ...mesh,
      positions,
      normals,
      featureData2,
    };
  },
};
