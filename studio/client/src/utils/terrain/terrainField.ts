/**
 * Heightfield compositor — the core of terrain generation.
 *
 * A terrain is a regular grid of heights over a square footprint. Every feature
 * (mountains, craters, ridges, fissures) is composited as a SCALAR contribution
 * to the height grid *before* any geometry is built. Because we sum scalars
 * instead of pushing 3D vertices along normals and re-deriving normals between
 * steps (the asteroid mesh-modifier approach), overlapping features can never
 * produce self-intersecting / torn geometry — they simply add up. Normals are
 * derived once, analytically, from the final height gradient.
 *
 * Feature channels (written for the AsteroidMaterial shader, matching the
 * asteroid mesh modifiers' convention):
 *   featureData.r  crater (positive = floor)
 *   featureData.g  boulder intensity
 *   featureData.b  fissure depth
 *   featureData.a  layer edge
 *   featureData2.r ridge intensity
 */

import type { MeshData } from "../meshModifiers";
import { mulberry32 } from "../prng";
import { makeNoise2D, fbm, ridged, warpedFbm, type FbmOptions } from "./noise";

export interface TerrainField {
  /** Vertices per side (grid is res × res). */
  res: number;
  /** World-space footprint side length. */
  size: number;
  /** res*res absolute heights (world units). */
  heights: Float32Array;
  /** res*res*4 — crater(r), boulder(g), fissure(b), layer(a). */
  feature: Float32Array;
  /** res*res*4 — ridge(r), reserved. */
  feature2: Float32Array;
}

export function createField(res: number, size: number): TerrainField {
  return {
    res,
    size,
    heights: new Float32Array(res * res),
    feature: new Float32Array(res * res * 4),
    feature2: new Float32Array(res * res * 4),
  };
}

/** World X/Z coordinate of grid column/row index (centered on origin). */
function coord(idx: number, res: number, size: number): number {
  return (idx / (res - 1) - 0.5) * size;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

// ── Layer: base rolling terrain (domain-warped fbm) ──────────────────

export interface BaseLayerParams {
  amplitude: number;
  octaves: number;
  lacunarity: number;
  persistence: number;
  /** Spatial frequency in cycles across the footprint. */
  frequency: number;
  /** Domain-warp strength (0 = none). */
  warp: number;
}

export function applyBaseFbm(field: TerrainField, p: BaseLayerParams, seed: number): void {
  const nBase = makeNoise2D(seed);
  const nWx = makeNoise2D(seed ^ 0x1b873593);
  const nWy = makeNoise2D(seed ^ 0x19088711);
  const opts: FbmOptions = {
    octaves: Math.max(1, Math.round(p.octaves)),
    lacunarity: p.lacunarity,
    persistence: p.persistence,
    frequency: p.frequency / field.size,
  };
  const { res, size, heights } = field;
  for (let j = 0; j < res; j++) {
    const z = coord(j, res, size);
    for (let i = 0; i < res; i++) {
      const x = coord(i, res, size);
      const v = warpedFbm(nBase, nWx, nWy, x, z, opts, p.warp);
      heights[j * res + i] += v * p.amplitude;
    }
  }
}

// ── Layer: mountains (ridged multifractal) ───────────────────────────

export interface MountainLayerParams {
  /** Peak height (world units). */
  height: number;
  /** Cycles across the footprint (lower = larger massifs). */
  frequency: number;
  octaves: number;
  /** Number of distinct mountain regions; the rest of the patch stays flat. */
  regions: number;
  /** Ridged-vs-billow blend [0..1]: 1 = sharp ridgelines, 0 = smooth rounded mass. */
  sharpness: number;
}

export function applyMountains(field: TerrainField, p: MountainLayerParams, seed: number): void {
  const { res, size, heights } = field;
  const oct = Math.max(2, Math.min(5, Math.round(p.octaves)));

  // Ridged field = ridgelines; billow field = smooth rounded mass. We blend them
  // and DOMAIN-WARP the inputs so ridges wind organically instead of forming one
  // spike with sharp radial pickets. Lower persistence weakens the tiny
  // high-frequency sub-ridges that read as "spiky".
  const nRidge = makeNoise2D(seed);
  const nBillow = makeNoise2D(seed ^ 0x68bc21);
  const nWarpX = makeNoise2D(seed ^ 0x1f83d9);
  const nWarpY = makeNoise2D(seed ^ 0x2b3e6c);
  const ridgeOpts: FbmOptions = { octaves: oct, lacunarity: 2.0, persistence: 0.42, frequency: p.frequency / size };
  const billowOpts: FbmOptions = { octaves: Math.max(2, oct - 1), lacunarity: 2.0, persistence: 0.5, frequency: (p.frequency * 0.7) / size };
  const warpOpts: FbmOptions = { octaves: 2, lacunarity: 2.0, persistence: 0.5, frequency: (p.frequency * 0.5) / size };
  const warp = size * 0.12;

  const rand = mulberry32(seed ^ 0x51ed270b);
  const regionCount = Math.max(1, Math.round(p.regions));
  const centers: Array<{ cx: number; cz: number; radius: number }> = [];
  for (let k = 0; k < regionCount; k++) {
    centers.push({
      cx: (rand() - 0.5) * size * 0.9,
      cz: (rand() - 0.5) * size * 0.9,
      radius: size * (0.14 + rand() * 0.2),
    });
  }

  for (let j = 0; j < res; j++) {
    const z = coord(j, res, size);
    for (let i = 0; i < res; i++) {
      const x = coord(i, res, size);
      let mask = 0;
      for (const c of centers) {
        const d = Math.hypot(x - c.cx, z - c.cz);
        const m = smoothstep(c.radius, 0, d);
        if (m > mask) mask = m;
      }
      if (mask <= 0) continue;

      const wx = fbm(nWarpX, x, z, warpOpts) * warp;
      const wy = fbm(nWarpY, x, z, warpOpts) * warp;
      // Rounded ridgelines: pow<1 broadens crests so they aren't razor-sharp.
      const rid = Math.pow(ridged(nRidge, x + wx, z + wy, ridgeOpts), 0.75);
      const billow = fbm(nBillow, x + wx, z + wy, billowOpts) * 0.5 + 0.5; // [0,1]
      // Blend ridgelines with billow. sharpness=1 → crisp ridges, 0 → rounded
      // mass; billow filling the valleys keeps it a massif, not isolated spikes.
      const sw = Math.min(1, Math.max(0, p.sharpness));
      const hN = sw * rid + (1 - sw) * billow;
      heights[j * res + i] += hN * p.height * (mask * (3 - 2 * mask) * mask);
    }
  }
}

// ── Layer: craters (radial stamp, large-first) ───────────────────────

export interface CraterLayerParams {
  count: number;
  /** Min/max radius as a fraction of footprint size. */
  minSize: number;
  maxSize: number;
  /** Bowl depth as a fraction of radius. */
  depthRatio: number;
  /** Rim height as a fraction of radius. */
  rimHeight: number;
  /** Power-law size exponent (higher → more small craters). */
  sizeExponent: number;
}

export function applyCraters(field: TerrainField, p: CraterLayerParams, seed: number): void {
  if (p.count <= 0) return;
  const rand = mulberry32(seed);
  const { res, size, heights, feature } = field;

  interface Crater { cx: number; cz: number; radius: number; }
  const craters: Crater[] = [];
  for (let k = 0; k < p.count; k++) {
    const u = rand();
    const rel = Math.min(p.maxSize, p.minSize * Math.pow(u, -1.0 / p.sizeExponent));
    craters.push({
      cx: (rand() - 0.5) * size,
      cz: (rand() - 0.5) * size,
      radius: rel * size,
    });
  }
  // Stamp largest first so small craters can sit inside big bowls believably.
  craters.sort((a, b) => b.radius - a.radius);

  const cell = size / (res - 1);
  // Compose craters with min (bowls) / max (rims) instead of plain addition, so
  // overlapping craters merge into the deeper bowl rather than stacking into a
  // false ridge at the seam. Ejecta is a thin additive blanket beyond the rim.
  const carve = new Float32Array(res * res); // most-negative bowl wins
  const rimBuf = new Float32Array(res * res); // tallest rim wins
  const ejecta = new Float32Array(res * res); // additive ejecta blanket
  const ejectaExtent = 1.8;

  for (const c of craters) {
    const depth = c.radius * p.depthRatio;
    const rimH = c.radius * p.rimHeight;
    const reach = c.radius * ejectaExtent;
    const i0 = Math.max(0, Math.floor((c.cx + size / 2 - reach) / cell));
    const i1 = Math.min(res - 1, Math.ceil((c.cx + size / 2 + reach) / cell));
    const j0 = Math.max(0, Math.floor((c.cz + size / 2 - reach) / cell));
    const j1 = Math.min(res - 1, Math.ceil((c.cz + size / 2 + reach) / cell));
    for (let j = j0; j <= j1; j++) {
      const z = coord(j, res, size);
      for (let i = i0; i <= i1; i++) {
        const x = coord(i, res, size);
        const d = Math.hypot(x - c.cx, z - c.cz);
        const t = d / c.radius;
        const idx = j * res + i;
        if (t < 1) {
          const bowl = -depth * Math.pow(1 - t * t, 1.35);
          if (bowl < carve[idx]!) carve[idx] = bowl;
          const floorIntensity = (1 - t) * (depth / (c.radius || 1));
          const fi = idx * 4;
          if (floorIntensity > feature[fi]!) feature[fi] = Math.min(1, floorIntensity);
        }
        // Raised rim around t ≈ 1.
        const rim = rimH * Math.exp(-Math.pow((t - 1.0) / 0.28, 2));
        if (rim > rimBuf[idx]!) rimBuf[idx] = rim;
        // Ejecta blanket: thin, decaying outward from the rim.
        if (t > 1 && t < ejectaExtent) {
          const e = rimH * 0.22 * Math.pow((ejectaExtent - t) / (ejectaExtent - 1), 2);
          ejecta[idx] += e;
        }
      }
    }
  }

  for (let k = 0; k < heights.length; k++) {
    heights[k] += carve[k]! + rimBuf[k]! + ejecta[k]!;
  }
}

// ── Layer: linear ridges / fissures (polyline carve) ─────────────────

export interface LineLayerParams {
  count: number;
  /** Height (ridge, +) or depth (fissure, −) as a fraction of footprint. */
  amount: number;
  /** Half-width as a fraction of footprint. */
  width: number;
  /** Length as a fraction of footprint. */
  length: number;
  /** Path waviness [0..1]. */
  jaggedness: number;
  /** "ridge" → raise + featureData2.r, "fissure" → carve + featureData.b. */
  kind: "ridge" | "fissure";
}

export function applyLines(field: TerrainField, p: LineLayerParams, seed: number): void {
  if (p.count <= 0) return;
  const rand = mulberry32(seed);
  const { res, size, heights, feature, feature2 } = field;
  const halfWidth = p.width * size;
  const amplitude = p.amount * size * (p.kind === "fissure" ? -1 : 1);

  for (let k = 0; k < p.count; k++) {
    // Build a wavy polyline across the footprint.
    const segs = 12;
    const totalLen = p.length * size;
    let px = (rand() - 0.5) * size;
    let pz = (rand() - 0.5) * size;
    let ang = rand() * Math.PI * 2;
    const pts: Array<[number, number]> = [[px, pz]];
    const step = totalLen / segs;
    for (let s = 0; s < segs; s++) {
      ang += (rand() - 0.5) * p.jaggedness * 1.2;
      px += Math.cos(ang) * step;
      pz += Math.sin(ang) * step;
      pts.push([px, pz]);
    }

    // Bounding box of the polyline + width.
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of pts) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
    const cell = size / (res - 1);
    const i0 = Math.max(0, Math.floor((minX - halfWidth + size / 2) / cell));
    const i1 = Math.min(res - 1, Math.ceil((maxX + halfWidth + size / 2) / cell));
    const j0 = Math.max(0, Math.floor((minZ - halfWidth + size / 2) / cell));
    const j1 = Math.min(res - 1, Math.ceil((maxZ + halfWidth + size / 2) / cell));

    for (let j = j0; j <= j1; j++) {
      const z = coord(j, res, size);
      for (let i = i0; i <= i1; i++) {
        const x = coord(i, res, size);
        const dist = distanceToPolyline(x, z, pts);
        if (dist >= halfWidth) continue;
        const t = dist / halfWidth;
        const profile = Math.cos(t * Math.PI * 0.5); // 1 at center → 0 at edge
        const idx = j * res + i;
        heights[idx] += amplitude * profile;
        const intensity = Math.min(1, profile);
        if (p.kind === "ridge") {
          const fi = idx * 4;
          if (intensity > feature2[fi]!) feature2[fi] = intensity;
        } else {
          const fi = idx * 4 + 2;
          if (intensity > feature[fi]!) feature[fi] = intensity;
        }
      }
    }
  }
}

function distanceToPolyline(x: number, z: number, pts: Array<[number, number]>): number {
  let best = Infinity;
  for (let s = 0; s < pts.length - 1; s++) {
    const [ax, az] = pts[s]!;
    const [bx, bz] = pts[s + 1]!;
    const dx = bx - ax;
    const dz = bz - az;
    const len2 = dx * dx + dz * dz || 1e-9;
    let u = ((x - ax) * dx + (z - az) * dz) / len2;
    u = Math.min(1, Math.max(0, u));
    const cx = ax + u * dx;
    const cz = az + u * dz;
    const d = Math.hypot(x - cx, z - cz);
    if (d < best) best = d;
  }
  return best;
}

// ── Thermal erosion (talus / scree) ──────────────────────────────────

export interface ErosionParams {
  /** Number of relaxation passes. */
  iterations: number;
  /** Angle of repose as a height/cell-width ratio — slopes steeper than this slump. */
  talus: number;
  /** Fraction of the excess moved per pass [0..1]. */
  strength: number;
}

/**
 * Thermal erosion: wherever the slope between neighbours exceeds the angle of
 * repose, material slumps downhill. This adds realistic scree at the foot of
 * mountains and crater rims and softens noise-y ridges into weathered slopes —
 * something pure fbm/ridged noise can't produce. Deterministic (no RNG): a pure
 * function of the existing height grid.
 */
export function applyThermalErosion(field: TerrainField, p: ErosionParams): void {
  const { res, heights, size } = field;
  const cell = size / (res - 1);
  const talusH = p.talus * cell;
  const delta = new Float32Array(res * res);

  const pair = (a: number, b: number) => {
    const dh = heights[a]! - heights[b]!;
    const ad = Math.abs(dh);
    if (ad <= talusH) return;
    const move = (ad - talusH) * 0.5 * p.strength;
    if (dh > 0) { delta[a] -= move; delta[b] += move; }
    else { delta[a] += move; delta[b] -= move; }
  };

  for (let it = 0; it < p.iterations; it++) {
    delta.fill(0);
    for (let j = 0; j < res; j++) {
      for (let i = 0; i < res; i++) {
        const idx = j * res + i;
        if (i < res - 1) pair(idx, idx + 1);     // right neighbour
        if (j < res - 1) pair(idx, idx + res);    // down neighbour
      }
    }
    for (let k = 0; k < heights.length; k++) heights[k] += delta[k]!;
  }
}

/** Surface normal at world (x, z) from the height gradient — seats rocks on slopes. */
export function sampleNormal(field: TerrainField, x: number, z: number): [number, number, number] {
  const e = field.size / (field.res - 1);
  const hl = sampleHeight(field, x - e, z);
  const hr = sampleHeight(field, x + e, z);
  const hd = sampleHeight(field, x, z - e);
  const hu = sampleHeight(field, x, z + e);
  const nx = (hl - hr) / (2 * e);
  const nz = (hd - hu) / (2 * e);
  const ny = 1;
  const inv = 1 / Math.hypot(nx, ny, nz);
  return [nx * inv, ny * inv, nz * inv];
}

// ── Build renderable mesh from the height grid ───────────────────────

export function buildTerrainMesh(field: TerrainField): MeshData {
  const { res, size, heights, feature, feature2 } = field;
  const vertexCount = res * res;
  const positions = new Float64Array(vertexCount * 3);
  const normals = new Float64Array(vertexCount * 3);
  const featureData = new Float32Array(vertexCount * 4);
  const featureData2 = new Float32Array(vertexCount * 4);
  const cell = size / (res - 1);

  for (let j = 0; j < res; j++) {
    const z = coord(j, res, size);
    for (let i = 0; i < res; i++) {
      const idx = j * res + i;
      positions[idx * 3] = coord(i, res, size);
      positions[idx * 3 + 1] = heights[idx]!;
      positions[idx * 3 + 2] = z;

      // Analytic normal from central-difference height gradient.
      const hl = heights[j * res + Math.max(0, i - 1)]!;
      const hr = heights[j * res + Math.min(res - 1, i + 1)]!;
      const hd = heights[Math.max(0, j - 1) * res + i]!;
      const hu = heights[Math.min(res - 1, j + 1) * res + i]!;
      const nx = (hl - hr) / (2 * cell);
      const nz = (hd - hu) / (2 * cell);
      const ny = 1;
      const inv = 1 / Math.hypot(nx, ny, nz);
      normals[idx * 3] = nx * inv;
      normals[idx * 3 + 1] = ny * inv;
      normals[idx * 3 + 2] = nz * inv;

      featureData.set(feature.subarray(idx * 4, idx * 4 + 4), idx * 4);
      featureData2.set(feature2.subarray(idx * 4, idx * 4 + 4), idx * 4);
    }
  }

  const indices = new Uint32Array((res - 1) * (res - 1) * 6);
  let t = 0;
  for (let j = 0; j < res - 1; j++) {
    for (let i = 0; i < res - 1; i++) {
      const a = j * res + i;
      const b = j * res + i + 1;
      const c = (j + 1) * res + i;
      const d = (j + 1) * res + i + 1;
      indices[t++] = a; indices[t++] = c; indices[t++] = b;
      indices[t++] = b; indices[t++] = c; indices[t++] = d;
    }
  }

  return {
    positions,
    normals,
    indices,
    vertexCount,
    triCount: indices.length / 3,
    featureData,
    featureData2,
  };
}

/** Bilinear height sample at a world (x, z) — used to seat scattered rocks. */
export function sampleHeight(field: TerrainField, x: number, z: number): number {
  const { res, size, heights } = field;
  const fx = (x / size + 0.5) * (res - 1);
  const fz = (z / size + 0.5) * (res - 1);
  const i = Math.min(res - 2, Math.max(0, Math.floor(fx)));
  const j = Math.min(res - 2, Math.max(0, Math.floor(fz)));
  const tx = Math.min(1, Math.max(0, fx - i));
  const tz = Math.min(1, Math.max(0, fz - j));
  const h00 = heights[j * res + i]!;
  const h10 = heights[j * res + i + 1]!;
  const h01 = heights[(j + 1) * res + i]!;
  const h11 = heights[(j + 1) * res + i + 1]!;
  return (
    h00 * (1 - tx) * (1 - tz) +
    h10 * tx * (1 - tz) +
    h01 * (1 - tx) * tz +
    h11 * tx * tz
  );
}
