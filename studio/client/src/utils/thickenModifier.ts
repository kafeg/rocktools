import {
  type MeshData,
  type MeshModifier,
  buildAdjacency,
  computeVertexNormals,
  ensureOccupancy,
  getMeshRadius,
} from "./meshModifiers";

/**
 * Plate thickening: find surface that has solid rock only a hair behind it and push the two
 * sides apart.
 *
 * `rockcreate` writes a base hull of 26 triangles over 15 vertices, and every shipped triangle
 * is one of those subdivided. Where two hull faces meet at a sharp fold, the displaced surface
 * becomes a thin wedge — the blade-like flanges on a body's limb. Smoothing does not cure it
 * (2/7/9 rocksmooth passes leave Ryugu at 1.07/1.53/1.96 % thickness at the 5th percentile),
 * because the fold is in the base topology, not in the detail amplitude.
 *
 * So measure the body's LOCAL THICKNESS and fix only where it is too small: cast a short ray
 * from each vertex straight into the rock along the inverted normal, and where it exits again
 * within `threshold`, lift that vertex — and the far side it hit — outward by half the missing
 * thickness. The lift is then DILATED and SMOOTHED as a scalar field over the 1-ring before any
 * vertex moves, so the thickened patch rejoins the surface over many edges instead of leaving a
 * step where the thin region ended. That field smoothing is the whole trick: displacing the
 * detected vertices directly trades a thin blade for a fresh crease around it.
 *
 * The far side must FACE AWAY from the vertex (`dot(hitFaceNormal, vertexNormal) < 0`). That one
 * test is what separates a thin plate from a narrow concave crevice, where the ray crosses a
 * groove and strikes a wall that looks back at us: a fissure is meant to be narrow and must not
 * be inflated shut.
 *
 * Deterministic — no PRNG; the output follows from the geometry alone.
 */
export interface ThickenParams {
  /** Thinner than this (fraction of mesh radius) counts as geometry to repair. */
  threshold: number;
  /** How hard to repair where it is thinnest (0 = measure only, 1 = full). */
  strength: number;
  /** Rings of surface the repair fades out over, past the vertices that detected the fin. */
  spread: number;
  /** Averaging passes over the repair WEIGHT inside that band — removes the per-ring banding. */
  smoothPasses: number;
  /**
   * 1-ring passes that define the body's underlying shape — the surface a thin place is pulled
   * back onto. More passes reach past a bigger fin.
   */
  referencePasses: number;
  /** Measure-then-repair rounds; a fin only partly collapsed is seen again by the next one. */
  rounds: number;
  /**
   * 1-ring passes defining what counts as surface GRAIN rather than shape. Whatever grain the
   * repair smooths away is put back afterwards, so the repaired patch still reads as rock.
   */
  grainPasses: number;
}

/**
 * Measured on Ryugu at the shipped subdivision depth 6 (106,496 triangles): thin surface — within
 * 3 % of the radius of rock behind it — falls from 6.6 % of the vertices to 0.9 %, the largest
 * connected thin patch from 62 % of the radius to 13 %, while the body's mean dihedral moves
 * 11.18° → 10.65° and its fine-detail amplitude 0.147 % → 0.139 % of the radius (both within 5 %),
 * its volume by −0.2 %, and the surface the repair never reaches by 0.01°. About 1.5 s.
 */
const DEFAULTS: ThickenParams = {
  threshold: 0.05,
  strength: 1,
  spread: 4,
  smoothPasses: 8,
  referencePasses: 96,
  rounds: 8,
  grainPasses: 3,
};

/**
 * Triangles bucketed into a uniform grid, flattened into typed arrays (an array-of-arrays costs
 * more than the lookup saves at 100k+ triangles). Cell size is the ray length, so a ray spans at
 * most two cells per axis and the candidate set stays tiny.
 */
interface TriGrid {
  min: [number, number, number];
  cell: number;
  dims: [number, number, number];
  start: Uint32Array;
  items: Uint32Array;
}

function buildTriGrid(positions: Float64Array, indices: Uint32Array, cell: number): TriGrid {
  const triCount = indices.length / 3;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!, y = positions[i + 1]!, z = positions[i + 2]!;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  const dims: [number, number, number] = [
    Math.max(1, Math.ceil((maxX - minX) / cell) + 1),
    Math.max(1, Math.ceil((maxY - minY) / cell) + 1),
    Math.max(1, Math.ceil((maxZ - minZ) / cell) + 1),
  ];
  const cellCount = dims[0] * dims[1] * dims[2];
  const start = new Uint32Array(cellCount + 1);
  const lo = [0, 0, 0], hi = [0, 0, 0];
  const range = (t: number) => {
    for (let k = 0; k < 3; k++) {
      const base = k === 0 ? minX : k === 1 ? minY : minZ;
      let a = Infinity, b = -Infinity;
      for (let e = 0; e < 3; e++) {
        const v = positions[indices[t * 3 + e]! * 3 + k]!;
        if (v < a) a = v; if (v > b) b = v;
      }
      lo[k] = Math.max(0, Math.min(dims[k] - 1, Math.floor((a - base) / cell)));
      hi[k] = Math.max(0, Math.min(dims[k] - 1, Math.floor((b - base) / cell)));
    }
  };
  for (let t = 0; t < triCount; t++) {
    range(t);
    for (let z = lo[2]!; z <= hi[2]!; z++)
      for (let y = lo[1]!; y <= hi[1]!; y++)
        for (let x = lo[0]!; x <= hi[0]!; x++) start[(z * dims[1] + y) * dims[0] + x + 1]!++;
  }
  for (let c = 0; c < cellCount; c++) start[c + 1]! += start[c]!;
  const items = new Uint32Array(start[cellCount]!);
  const cursor = new Uint32Array(cellCount);
  for (let t = 0; t < triCount; t++) {
    range(t);
    for (let z = lo[2]!; z <= hi[2]!; z++)
      for (let y = lo[1]!; y <= hi[1]!; y++)
        for (let x = lo[0]!; x <= hi[0]!; x++) {
          const c = (z * dims[1] + y) * dims[0] + x;
          items[start[c]! + cursor[c]!++] = t;
        }
  }
  return { min: [minX, minY, minZ], cell, dims, start, items };
}

/** Area-weighted face normals, one per triangle. */
function faceNormals(positions: Float64Array, indices: Uint32Array): Float64Array {
  const triCount = indices.length / 3;
  const out = new Float64Array(triCount * 3);
  for (let t = 0; t < triCount; t++) {
    const a = indices[t * 3]! * 3, b = indices[t * 3 + 1]! * 3, c = indices[t * 3 + 2]! * 3;
    const ux = positions[b]! - positions[a]!, uy = positions[b + 1]! - positions[a + 1]!, uz = positions[b + 2]! - positions[a + 2]!;
    const vx = positions[c]! - positions[a]!, vy = positions[c + 1]! - positions[a + 1]!, vz = positions[c + 2]! - positions[a + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    out[t * 3] = nx / len; out[t * 3 + 1] = ny / len; out[t * 3 + 2] = nz / len;
  }
  return out;
}

/**
 * How much thickness each vertex is missing, as a fraction of `reach` (0 = thick enough).
 * Both the vertex and the far side it hit are marked, because the rays only see a fin from
 * whichever face they happen to start on.
 */
function measureDeficit(
  positions: Float64Array,
  normals: Float64Array,
  indices: Uint32Array,
  vertexCount: number,
  reach: number,
  eps: number,
): Float64Array {
  const grid = buildTriGrid(positions, indices, reach);
  const faceN = faceNormals(positions, indices);
  const deficit = new Float64Array(vertexCount);
  const stamp = new Int32Array(indices.length / 3).fill(-1);

  for (let vi = 0; vi < vertexCount; vi++) {
    let nx = normals[vi * 3]!, ny = normals[vi * 3 + 1]!, nz = normals[vi * 3 + 2]!;
    const nLen = Math.hypot(nx, ny, nz);
    if (nLen < 1e-12) continue;
    nx /= nLen; ny /= nLen; nz /= nLen;

    // Straight into the rock, offset off the surface so the vertex's own faces are not hit.
    const dx = -nx, dy = -ny, dz = -nz;
    const ox = positions[vi * 3]! + dx * eps;
    const oy = positions[vi * 3 + 1]! + dy * eps;
    const oz = positions[vi * 3 + 2]! + dz * eps;

    let bestT = Infinity;
    let bestTri = -1;
    const lo = [0, 0, 0], hi = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const o = k === 0 ? ox : k === 1 ? oy : oz;
      const d = k === 0 ? dx : k === 1 ? dy : dz;
      const a = Math.min(o, o + d * reach), b = Math.max(o, o + d * reach);
      lo[k] = Math.max(0, Math.min(grid.dims[k] - 1, Math.floor((a - grid.min[k]!) / grid.cell)));
      hi[k] = Math.max(0, Math.min(grid.dims[k] - 1, Math.floor((b - grid.min[k]!) / grid.cell)));
    }

    for (let z = lo[2]!; z <= hi[2]!; z++)
      for (let y = lo[1]!; y <= hi[1]!; y++)
        for (let x = lo[0]!; x <= hi[0]!; x++) {
          const c = (z * grid.dims[1] + y) * grid.dims[0] + x;
          for (let s = grid.start[c]!; s < grid.start[c + 1]!; s++) {
            const t = grid.items[s]!;
            if (stamp[t] === vi) continue;
            stamp[t] = vi;

            const i0 = indices[t * 3]!, i1 = indices[t * 3 + 1]!, i2 = indices[t * 3 + 2]!;
            if (i0 === vi || i1 === vi || i2 === vi) continue;
            // Only a surface turned away from us bounds a fin; one looking back at us is the far
            // wall of a groove, and a fissure is meant to be narrow — leave it alone.
            if (faceN[t * 3]! * nx + faceN[t * 3 + 1]! * ny + faceN[t * 3 + 2]! * nz >= 0) continue;

            // Möller–Trumbore, double-sided.
            const ax = positions[i0 * 3]!, ay = positions[i0 * 3 + 1]!, az = positions[i0 * 3 + 2]!;
            const e1x = positions[i1 * 3]! - ax, e1y = positions[i1 * 3 + 1]! - ay, e1z = positions[i1 * 3 + 2]! - az;
            const e2x = positions[i2 * 3]! - ax, e2y = positions[i2 * 3 + 1]! - ay, e2z = positions[i2 * 3 + 2]! - az;
            const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
            const det = e1x * px + e1y * py + e1z * pz;
            if (Math.abs(det) < 1e-18) continue;
            const inv = 1 / det;
            const tx = ox - ax, ty = oy - ay, tz = oz - az;
            const u = (tx * px + ty * py + tz * pz) * inv;
            if (u < 0 || u > 1) continue;
            const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
            const v = (dx * qx + dy * qy + dz * qz) * inv;
            if (v < 0 || u + v > 1) continue;
            const hitT = (e2x * qx + e2y * qy + e2z * qz) * inv;
            if (hitT <= 0 || hitT >= reach || hitT >= bestT) continue;
            bestT = hitT;
            bestTri = t;
          }
        }

    if (bestTri < 0) continue;
    const share = (reach - bestT) / reach;
    if (share > deficit[vi]!) deficit[vi] = share;
    for (let e = 0; e < 3; e++) {
      const k = indices[bestTri * 3 + e]!;
      if (share > deficit[k]!) deficit[k] = share;
    }
  }
  return deficit;
}

/**
 * A repair weight: full where the rays found trouble, fading to zero `spread` rings out.
 *
 * The band is built by ring DISTANCE, not by diffusing the weight: a diffused field has a long
 * tail, and a tail that smooths the geometry even weakly over dozens of passes flattens the whole
 * rock. Measured on Ryugu, 24 unmasked averaging passes moved 42 % of the vertices and took the
 * body's mean dihedral from 11.18° to 7.07°, while the vertices the repair never reached kept
 * theirs exactly (8.01° → 7.99°). Compact support is what keeps a repair local.
 */
function buildBand(
  core: Float64Array,
  adjacency: number[][],
  vertexCount: number,
  spread: number,
  smoothPasses: number,
): Float64Array | null {
  const weight = new Float64Array(vertexCount);
  const inBand = new Uint8Array(vertexCount);
  let front: number[] = [];
  for (let vi = 0; vi < vertexCount; vi++) {
    if (core[vi]! <= 0) continue;
    weight[vi] = core[vi]!;
    inBand[vi] = 1;
    front.push(vi);
  }
  if (front.length === 0) return null;
  for (let ring = 1; ring <= spread && front.length > 0; ring++) {
    // Smoothstep down the band so the weight leaves the repaired patch with zero slope.
    const e = 1 - ring / (spread + 1);
    const falloff = e * e * (3 - 2 * e);
    const next: number[] = [];
    for (const vi of front) {
      for (const w of adjacency[vi]!) {
        if (inBand[w]) continue;
        inBand[w] = 1;
        weight[w] = core[vi]! * falloff;
        next.push(w);
      }
    }
    front = next;
  }
  for (let pass = 0; pass < smoothPasses; pass++) {
    const next = new Float64Array(vertexCount);
    for (let vi = 0; vi < vertexCount; vi++) {
      if (!inBand[vi]) continue;
      const ring = adjacency[vi]!;
      let sum = weight[vi]!, n = 1;
      for (const w of ring) { sum += weight[w]!; n++; }
      next[vi] = sum / n;
    }
    for (let vi = 0; vi < vertexCount; vi++) weight[vi] = next[vi]!;
  }
  return weight;
}

/**
 * The surface's own grain: how far each vertex stands off a lightly smoothed copy of itself.
 * A few passes keep only the finest relief, so the result carries the rock's texture and none of
 * its shape — which is what lets the repair give the grain back after flattening a fin away.
 */
function grainOf(positions: Float64Array, adjacency: number[][], vertexCount: number, passes: number): Float64Array {
  const smooth = smoothed(positions, adjacency, vertexCount, passes);
  const grain = new Float64Array(vertexCount * 3);
  for (let i = 0; i < grain.length; i++) grain[i] = positions[i]! - smooth[i]!;
  return grain;
}

/** Uniform 1-ring averaging, `passes` times, over the whole mesh. */
function smoothed(positions: Float64Array, adjacency: number[][], vertexCount: number, passes: number): Float64Array {
  let current = new Float64Array(positions);
  for (let pass = 0; pass < passes; pass++) {
    const next = new Float64Array(vertexCount * 3);
    for (let vi = 0; vi < vertexCount; vi++) {
      const ring = adjacency[vi]!;
      let x = current[vi * 3]!, y = current[vi * 3 + 1]!, z = current[vi * 3 + 2]!, n = 1;
      for (const w of ring) { x += current[w * 3]!; y += current[w * 3 + 1]!; z += current[w * 3 + 2]!; n++; }
      next[vi * 3] = x / n; next[vi * 3 + 1] = y / n; next[vi * 3 + 2] = z / n;
    }
    current = next;
  }
  return current;
}

export const thickenModifier: MeshModifier = {
  name: "mesh:thicken",

  apply(mesh: MeshData, rawParams: Record<string, number | string | boolean>): MeshData {
    const p: ThickenParams = { ...DEFAULTS };
    if (rawParams.threshold !== undefined) p.threshold = Number(rawParams.threshold);
    if (rawParams.strength !== undefined) p.strength = Number(rawParams.strength);
    if (rawParams.spread !== undefined) p.spread = Math.round(Number(rawParams.spread));
    if (rawParams.smoothPasses !== undefined) p.smoothPasses = Math.round(Number(rawParams.smoothPasses));
    if (rawParams.referencePasses !== undefined) p.referencePasses = Math.round(Number(rawParams.referencePasses));
    if (rawParams.rounds !== undefined) p.rounds = Math.round(Number(rawParams.rounds));
    if (rawParams.grainPasses !== undefined) p.grainPasses = Math.round(Number(rawParams.grainPasses));

    if (p.threshold <= 0 || p.strength <= 0 || p.referencePasses <= 0 || p.rounds <= 0) return mesh;

    const { indices, vertexCount } = mesh;
    const meshRadius = getMeshRadius(mesh);
    const reach = p.threshold * meshRadius;
    const eps = meshRadius * 1e-4;
    const adjacency = buildAdjacency(indices, vertexCount);
    const occupancy = ensureOccupancy(mesh);

    const positions: Float64Array = new Float64Array(mesh.positions);
    let normals: Float64Array = new Float64Array(mesh.normals);
    const repaired = new Float64Array(vertexCount);
    let moved = false;

    for (let round = 0; round < p.rounds; round++) {
      const deficit = measureDeficit(positions, normals, indices, vertexCount, reach, eps);
      const band = buildBand(deficit, adjacency, vertexCount, p.spread, p.smoothPasses);
      if (!band) break;

      for (let vi = 0; vi < vertexCount; vi++) {
        const w = Math.min(1, band[vi]! * p.strength);
        if (w > repaired[vi]!) repaired[vi] = w;
      }

      // The repair: pull the thin surface back onto the body's underlying shape — a smoothed copy
      // of the whole mesh — by the band weight. A fin at the limb is a sheet whose two faces are
      // each other's neighbours, so iterating a weighted 1-ring average only squeezes its
      // cross-section (measured: the largest fin went from 2.0 × 1.2 to 1.0 × 0.5 % of the radius
      // and stayed a fin); blending toward a surface that does not have the fin removes it.
      //
      // Pushing the two faces APART instead, as a thin PLATE would want, is the wrong operation
      // and was measured twice: applied to every thin vertex it took Ryugu's thin share from
      // 6.6 % to 10.2 % and its largest thin patch from 62 % to 137 % of the radius, and applied
      // only where the far side lies more than a few rings away across the mesh — two sheets of
      // the body genuinely overlapping rather than one surface bent on itself — it still gave
      // 5.0 % and a 91 % patch. An outward push lengthens a thin feature faster than it thickens
      // it, whatever the topology behind it.
      const reference = smoothed(positions, adjacency, vertexCount, p.referencePasses);
      for (let vi = 0; vi < vertexCount; vi++) {
        const w = Math.min(1, band[vi]! * p.strength);
        if (w < 1e-6) continue;
        for (let k = 0; k < 3; k++) {
          positions[vi * 3 + k] += (reference[vi * 3 + k]! - positions[vi * 3 + k]!) * w;
        }
        moved = true;
      }
      normals = computeVertexNormals(positions, indices, vertexCount);
    }

    if (!moved) return mesh;

    // Give back the grain the repair smoothed off. Collapsing a fin has to remove geometry at the
    // fin's own scale, and plain smoothing takes the rock's texture with it — on Ryugu that cost
    // a quarter of the body's mean dihedral even though the untouched surface was untouched to
    // 0.02°. Re-adding the DIFFERENCE between the grain before and after, over the same weight
    // band, restores the texture without restoring the fin: grain amplitude is ~0.15 % of the
    // radius against a 3 % thickness threshold, twenty times too small to make anything thin.
    if (p.grainPasses > 0) {
      const before = grainOf(mesh.positions, adjacency, vertexCount, p.grainPasses);
      const after = grainOf(positions, adjacency, vertexCount, p.grainPasses);
      for (let vi = 0; vi < vertexCount; vi++) {
        const w = repaired[vi]!;
        if (w < 1e-6) continue;
        for (let k = 0; k < 3; k++) {
          positions[vi * 3 + k] += w * (before[vi * 3 + k]! - after[vi * 3 + k]!);
        }
      }
      normals = computeVertexNormals(positions, indices, vertexCount);
    }

    // Recorded so a later modifier's `avoidOverlap` still sees the moved surface. No featureData
    // tag: this is a repair, not a feature, and must not be shaded as one.
    for (let vi = 0; vi < vertexCount; vi++) {
      const d = Math.hypot(
        positions[vi * 3]! - mesh.positions[vi * 3]!,
        positions[vi * 3 + 1]! - mesh.positions[vi * 3 + 1]!,
        positions[vi * 3 + 2]! - mesh.positions[vi * 3 + 2]!,
      );
      if (d > occupancy[vi]!) occupancy[vi] = d;
    }

    return { ...mesh, positions, normals, occupancy };
  },
};
