/**
 * mesh:rocks — Scatter procedurally generated rock meshes across the surface.
 *
 * Unlike mesh:boulders (vertex displacement → bumps), this modifier adds real
 * 3D geometry: each rock is an independent mini-mesh placed on the surface.
 *
 * Rock generation uses the same algorithms as the WASM rocktools pipeline:
 *   1. Start from an icosahedron (12 verts, 20 tris)
 *   2. Perturb radially (like rockcreate irregularity)
 *   3. Midpoint subdivision + normal perturbation (rockdetail algorithm)
 *   4. Laplacian smoothing (rocksmooth algorithm)
 *
 * A small set of template rocks (3-8) is generated once, then instanced at
 * random positions/rotations/scales across the host mesh surface.
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
  buildAdjacency,
} from "./meshModifiers";
import { mulberry32 } from "./prng";

// ── Parameters ─────────────────────────────────────────────────────

export interface RockParams {
  count: number;
  minSize: number;
  maxSize: number;
  roughness: number;
  detail: number;
  embedDepth: number;
  templates: number;
  avoidOverlap: boolean;
  seed: number;
}

const DEFAULTS: RockParams = {
  count: 20,
  minSize: 0.02,
  maxSize: 0.08,
  roughness: 0.5,
  detail: 2,
  embedDepth: 0.35,
  templates: 5,
  avoidOverlap: true,
  seed: 1,
};

// ── Rock template generation ───────────────────────────────────────

/** Hardcoded unit icosahedron (12 vertices, 20 faces). */
function createIcosahedron(): MeshData {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw = [
    -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t, 0,
    0, -1, t, 0, 1, t, 0, -1, -t, 0, 1, -t,
    t, 0, -1, t, 0, 1, -t, 0, -1, -t, 0, 1,
  ];
  // Normalize to unit sphere
  const positions = new Float64Array(raw);
  for (let i = 0; i < 12; i++) {
    const x = positions[i * 3]!;
    const y = positions[i * 3 + 1]!;
    const z = positions[i * 3 + 2]!;
    const len = Math.sqrt(x * x + y * y + z * z);
    positions[i * 3] = x / len;
    positions[i * 3 + 1] = y / len;
    positions[i * 3 + 2] = z / len;
  }
  const indices = new Uint32Array([
    0, 11, 5, 0, 5, 1, 0, 1, 7, 0, 7, 10, 0, 10, 11,
    1, 5, 9, 5, 11, 4, 11, 10, 2, 10, 7, 6, 7, 1, 8,
    3, 9, 4, 3, 4, 2, 3, 2, 6, 3, 6, 8, 3, 8, 9,
    4, 9, 5, 2, 4, 11, 6, 2, 10, 8, 6, 7, 9, 8, 1,
  ]);
  const normals = computeVertexNormals(positions, indices, 12);
  return { positions, normals, indices, vertexCount: 12, triCount: 20 };
}

/** Perturb vertices radially to break spherical symmetry. */
function perturbRadially(mesh: MeshData, amount: number, rand: () => number): MeshData {
  const pos = new Float64Array(mesh.positions);
  for (let i = 0; i < mesh.vertexCount; i++) {
    const x = pos[i * 3]!;
    const y = pos[i * 3 + 1]!;
    const z = pos[i * 3 + 2]!;
    const r = Math.sqrt(x * x + y * y + z * z);
    if (r > 1e-10) {
      const factor = 1 + (rand() * 2 - 1) * amount;
      pos[i * 3] = x * factor;
      pos[i * 3 + 1] = y * factor;
      pos[i * 3 + 2] = z * factor;
    }
  }
  const normals = computeVertexNormals(pos, mesh.indices, mesh.vertexCount);
  return { ...mesh, positions: pos, normals };
}

/**
 * Midpoint subdivision with normal-direction perturbation.
 * Same algorithm as rockdetail -mid: split each triangle into 4 by
 * inserting edge midpoints, then displace midpoints along the local
 * radial direction by a random amount.
 */
function subdivideAndPerturb(
  mesh: MeshData,
  perturbation: number,
  rand: () => number,
): MeshData {
  const { positions: srcPos, indices: srcIdx, vertexCount: srcVC, triCount: srcTC } = mesh;

  // Map edge → midpoint vertex index (shared between adjacent tris)
  const edgeMid = new Map<string, number>();
  const newPos: number[] = [];
  for (let i = 0; i < srcVC * 3; i++) newPos.push(srcPos[i]!);
  let nextVert = srcVC;

  function midpoint(a: number, b: number): number {
    const key = a < b ? `${a}_${b}` : `${b}_${a}`;
    const cached = edgeMid.get(key);
    if (cached !== undefined) return cached;

    const mx = (srcPos[a * 3]! + srcPos[b * 3]!) * 0.5;
    const my = (srcPos[a * 3 + 1]! + srcPos[b * 3 + 1]!) * 0.5;
    const mz = (srcPos[a * 3 + 2]! + srcPos[b * 3 + 2]!) * 0.5;

    // Perturb along radial direction (same as rockdetail -mid)
    const r = Math.sqrt(mx * mx + my * my + mz * mz);
    if (r > 1e-10 && perturbation > 0) {
      const offset = (rand() * 2 - 1) * perturbation * r;
      newPos.push(mx + (mx / r) * offset, my + (my / r) * offset, mz + (mz / r) * offset);
    } else {
      newPos.push(mx, my, mz);
    }

    const idx = nextVert++;
    edgeMid.set(key, idx);
    return idx;
  }

  // Each triangle → 4 sub-triangles
  const newIdx: number[] = [];
  for (let i = 0; i < srcTC; i++) {
    const a = srcIdx[i * 3]!;
    const b = srcIdx[i * 3 + 1]!;
    const c = srcIdx[i * 3 + 2]!;
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    newIdx.push(a, ab, ca, ab, b, bc, ca, bc, c, ab, bc, ca);
  }

  const positions = new Float64Array(newPos);
  const indices = new Uint32Array(newIdx);
  const vertexCount = nextVert;
  const normals = computeVertexNormals(positions, indices, vertexCount);
  return { positions, normals, indices, vertexCount, triCount: newIdx.length / 3 };
}

/** Laplacian smoothing (same as rocksmooth). */
function laplacianSmooth(mesh: MeshData, passes: number): MeshData {
  const adj = buildAdjacency(mesh.indices, mesh.vertexCount);
  const pos = new Float64Array(mesh.positions);
  const tmp = new Float64Array(pos.length);

  for (let pass = 0; pass < passes; pass++) {
    tmp.set(pos);
    for (let i = 0; i < mesh.vertexCount; i++) {
      const neighbors = adj[i]!;
      if (neighbors.length === 0) continue;
      let sx = 0, sy = 0, sz = 0;
      for (const j of neighbors) {
        sx += pos[j * 3]!;
        sy += pos[j * 3 + 1]!;
        sz += pos[j * 3 + 2]!;
      }
      const n = neighbors.length;
      tmp[i * 3] = pos[i * 3]! * 0.5 + (sx / n) * 0.5;
      tmp[i * 3 + 1] = pos[i * 3 + 1]! * 0.5 + (sy / n) * 0.5;
      tmp[i * 3 + 2] = pos[i * 3 + 2]! * 0.5 + (sz / n) * 0.5;
    }
    pos.set(tmp);
  }

  const normals = computeVertexNormals(pos, mesh.indices, mesh.vertexCount);
  return { ...mesh, positions: pos, normals };
}

/**
 * Generate a single rock template mesh.
 * Pipeline: icosahedron → radial perturb → N× (subdivide + perturb) → smooth
 */
function generateRockTemplate(seed: number, roughness: number, detail: number): MeshData {
  const rand = mulberry32(seed);

  let rock = createIcosahedron();

  // Radial perturbation — break spherical symmetry (like rockcreate roundness < 1)
  rock = perturbRadially(rock, roughness * 0.4, rand);

  // Subdivide + perturb — add fractal detail (like rockdetail)
  const detailLevels = Math.max(1, Math.min(3, Math.round(detail)));
  for (let d = 0; d < detailLevels; d++) {
    const scale = roughness * 0.15 / (d + 1);
    rock = subdivideAndPerturb(rock, scale, rand);
  }

  // Laplacian smooth — soften sharp edges (like rocksmooth)
  rock = laplacianSmooth(rock, 1);

  return rock;
}

// ── Rotation math ──────────────────────────────────────────────────

/**
 * Build a rotation matrix that maps +Y to the given surface normal,
 * with an additional azimuth rotation around the normal.
 * Returns column vectors [right, up, forward] as a flat 9-element array.
 */
function buildPlacementBasis(
  normal: [number, number, number],
  azimuth: number,
): [number, number, number, number, number, number, number, number, number] {
  const [nx, ny, nz] = normal;

  // Find a tangent vector not parallel to normal
  let tx: number, ty: number, tz: number;
  if (Math.abs(ny) < 0.9) {
    // cross(normal, Y)
    tx = nz;
    ty = 0;
    tz = -nx;
  } else {
    // cross(normal, X)
    tx = 0;
    ty = -nz;
    tz = ny;
  }
  const tLen = Math.sqrt(tx * tx + ty * ty + tz * tz);
  tx /= tLen;
  ty /= tLen;
  tz /= tLen;

  // Bitangent = cross(tangent, normal) — ensures right-handed basis (positive determinant)
  let bx = ty * nz - tz * ny;
  let by = tz * nx - tx * nz;
  let bz = tx * ny - ty * nx;

  // Apply azimuth rotation around normal
  const ca = Math.cos(azimuth);
  const sa = Math.sin(azimuth);
  const rx = tx * ca + bx * sa;
  const ry = ty * ca + by * sa;
  const rz = tz * ca + bz * sa;
  bx = -tx * sa + bx * ca;
  by = -ty * sa + by * ca;
  bz = -tz * sa + bz * ca;

  // Columns: right (tangent), up (normal), forward (bitangent)
  return [rx, ry, rz, nx, ny, nz, bx, by, bz];
}

// ── Main modifier ──────────────────────────────────────────────────

export const rockModifier: MeshModifier = {
  name: "mesh:rocks",

  apply(mesh: MeshData, rawParams: Record<string, number | string | boolean>): MeshData {
    const p: RockParams = { ...DEFAULTS };
    if (rawParams.count !== undefined) p.count = Math.round(Number(rawParams.count));
    if (rawParams.minSize !== undefined) p.minSize = Number(rawParams.minSize);
    if (rawParams.maxSize !== undefined) p.maxSize = Number(rawParams.maxSize);
    if (rawParams.roughness !== undefined) p.roughness = Number(rawParams.roughness);
    if (rawParams.detail !== undefined) p.detail = Math.round(Number(rawParams.detail));
    if (rawParams.embedDepth !== undefined) p.embedDepth = Number(rawParams.embedDepth);
    if (rawParams.templates !== undefined) p.templates = Math.max(1, Math.min(8, Math.round(Number(rawParams.templates))));
    if (rawParams.avoidOverlap !== undefined) p.avoidOverlap = rawParams.avoidOverlap === true || rawParams.avoidOverlap === "true";
    if (rawParams.seed !== undefined) p.seed = Number(rawParams.seed);

    if (p.count <= 0) return mesh;

    const rand = mulberry32(p.seed);
    const meshRadius = getMeshRadius(mesh);
    const areas = computeTriangleAreas(mesh);
    const totalArea = areas.reduce((s, a) => s + a, 0);
    const occupancy = ensureOccupancy(mesh);
    const featureData2 = ensureFeatureData2(mesh);

    // ── Generate template rocks ──────────────────────────────────
    const templateCount = Math.max(1, Math.min(8, p.templates));
    const templates: MeshData[] = [];
    for (let t = 0; t < templateCount; t++) {
      templates.push(generateRockTemplate(p.seed + t * 7919, p.roughness, p.detail));
    }

    // ── Plan rock placements ─────────────────────────────────────
    interface Placement {
      center: [number, number, number];
      normal: [number, number, number];
      radius: number;
      templateIdx: number;
      azimuth: number;
    }

    const placements: Placement[] = [];
    const maxAttempts = p.count * 5;
    let attempts = 0;

    while (placements.length < p.count && attempts < maxAttempts) {
      attempts++;
      const u = rand();
      const size = p.minSize + (p.maxSize - p.minSize) * Math.pow(u, 2);
      const radius = size * meshRadius;

      const { point, normal } = pickRandomSurfacePoint(mesh, areas, totalArea, rand);

      // Check overlap with existing placements
      if (p.avoidOverlap) {
        let overlaps = false;
        for (const existing of placements) {
          const dx = point[0] - existing.center[0];
          const dy = point[1] - existing.center[1];
          const dz = point[2] - existing.center[2];
          const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
          if (dist < (radius + existing.radius) * 0.8) {
            overlaps = true;
            break;
          }
        }
        if (overlaps) continue;
      }

      placements.push({
        center: point,
        normal,
        radius,
        templateIdx: Math.floor(rand() * templateCount),
        azimuth: rand() * Math.PI * 2,
      });
    }

    if (placements.length === 0) return mesh;

    // ── Compute total new geometry size ──────────────────────────
    let totalNewVerts = 0;
    let totalNewTris = 0;
    for (const pl of placements) {
      const tmpl = templates[pl.templateIdx]!;
      totalNewVerts += tmpl.vertexCount;
      totalNewTris += tmpl.triCount;
    }

    // ── Allocate merged arrays ───────────────────────────────────
    const mergedVertCount = mesh.vertexCount + totalNewVerts;
    const mergedTriCount = mesh.triCount + totalNewTris;

    const mergedPos = new Float64Array(mergedVertCount * 3);
    const mergedIdx = new Uint32Array(mergedTriCount * 3);
    const mergedOccupancy = new Float64Array(mergedVertCount);
    const mergedFeature2 = new Float32Array(mergedVertCount * 4);

    // Copy original mesh data
    mergedPos.set(mesh.positions);
    mergedIdx.set(mesh.indices);
    mergedOccupancy.set(occupancy);
    if (mesh.featureData2) mergedFeature2.set(mesh.featureData2);

    // ── Place each rock ──────────────────────────────────────────
    let vertOffset = mesh.vertexCount;
    let triOffset = mesh.triCount;

    for (const pl of placements) {
      const tmpl = templates[pl.templateIdx]!;
      const basis = buildPlacementBasis(pl.normal, pl.azimuth);

      // Compute template bounding radius for embed offset
      let tmplRadius = 0;
      for (let i = 0; i < tmpl.vertexCount; i++) {
        const x = tmpl.positions[i * 3]!;
        const y = tmpl.positions[i * 3 + 1]!;
        const z = tmpl.positions[i * 3 + 2]!;
        const r2 = x * x + y * y + z * z;
        if (r2 > tmplRadius) tmplRadius = r2;
      }
      tmplRadius = Math.sqrt(tmplRadius);
      const scale = pl.radius / (tmplRadius || 1);

      // Embed offset: move rock into surface along negative normal
      const embedOffset = p.embedDepth * pl.radius;
      const ox = pl.center[0] - pl.normal[0] * embedOffset;
      const oy = pl.center[1] - pl.normal[1] * embedOffset;
      const oz = pl.center[2] - pl.normal[2] * embedOffset;

      // Transform and write vertices
      for (let i = 0; i < tmpl.vertexCount; i++) {
        const lx = tmpl.positions[i * 3]! * scale;
        const ly = tmpl.positions[i * 3 + 1]! * scale;
        const lz = tmpl.positions[i * 3 + 2]! * scale;

        // Rotate: local → world via basis columns [right, up, forward]
        const wx = basis[0] * lx + basis[3] * ly + basis[6] * lz + ox;
        const wy = basis[1] * lx + basis[4] * ly + basis[7] * lz + oy;
        const wz = basis[2] * lx + basis[5] * ly + basis[8] * lz + oz;

        const vi = vertOffset + i;
        mergedPos[vi * 3] = wx;
        mergedPos[vi * 3 + 1] = wy;
        mergedPos[vi * 3 + 2] = wz;

        mergedOccupancy[vi] = pl.radius;

        // Feature data channel 2 (rocks): store intensity in .r for shader
        const fi = vi * 4;
        mergedFeature2[fi] = 1.0;
        mergedFeature2[fi + 1] = pl.radius / (meshRadius * 0.1);
      }

      // Write indices (offset by vertOffset)
      for (let i = 0; i < tmpl.triCount; i++) {
        const ti = (triOffset + i) * 3;
        mergedIdx[ti] = tmpl.indices[i * 3]! + vertOffset;
        mergedIdx[ti + 1] = tmpl.indices[i * 3 + 1]! + vertOffset;
        mergedIdx[ti + 2] = tmpl.indices[i * 3 + 2]! + vertOffset;
      }

      vertOffset += tmpl.vertexCount;
      triOffset += tmpl.triCount;
    }

    // Recompute normals for the entire merged mesh
    const mergedNormals = computeVertexNormals(mergedPos, mergedIdx, mergedVertCount);

    // Copy over featureData from the original mesh (if present)
    let mergedFeature: Float32Array | undefined;
    if (mesh.featureData) {
      mergedFeature = new Float32Array(mergedVertCount * 4);
      mergedFeature.set(mesh.featureData);
    }

    return {
      positions: mergedPos,
      normals: mergedNormals,
      indices: mergedIdx,
      vertexCount: mergedVertCount,
      triCount: mergedTriCount,
      occupancy: mergedOccupancy,
      featureData: mergedFeature,
      featureData2: mergedFeature2,
    };
  },
};
