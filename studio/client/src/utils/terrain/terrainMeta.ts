/**
 * Terrain metadata — derived gameplay info embedded into the exported GLB.
 *
 * The game needs to know more than geometry: where the flat, rock-free spots
 * are (landing pads / build sites), how rough the patch is overall, etc. We
 * compute this deterministically from the same height field + scatter, and
 * ship it as glTF `extras` (scene.userData) plus named marker nodes.
 *
 * All coordinates are in terrain-LOCAL units (the mesh's own XZ frame, before
 * any export/display scale), so the game maps them with footprint/exportScale.
 */

import { type TerrainField } from "./terrainField";
import type { TerrainScatter } from "./terrainScatter";

export interface LandingPad {
  x: number;
  y: number;
  z: number;
  /** Clear, flat radius in local units. */
  radius: number;
  /** Mean slope (0 = flat, 1 = vertical) inside the pad. */
  slope: number;
}

export interface TerrainMeta {
  asteroidSeed: number;
  surfaceSeed: number;
  /** Footprint side length in local units. */
  footprint: number;
  resolution: number;
  /** Best flat, rock-free spots, sorted flattest first. */
  landingPads: LandingPad[];
  stats: {
    maxSlope: number;
    /** Fraction of the patch flatter than the flatness threshold. */
    flatFraction: number;
    rockCount: number;
    vertexCount: number;
    triCount: number;
  };
}

/** Slope (0..1) at field cell (i, j) from the height gradient. */
function slopeAt(field: TerrainField, i: number, j: number): number {
  const { res, size, heights } = field;
  const cell = size / (res - 1);
  const hl = heights[j * res + Math.max(0, i - 1)]!;
  const hr = heights[j * res + Math.min(res - 1, i + 1)]!;
  const hd = heights[Math.max(0, j - 1) * res + i]!;
  const hu = heights[Math.min(res - 1, j + 1) * res + i]!;
  const nx = (hl - hr) / (2 * cell);
  const nz = (hd - hu) / (2 * cell);
  const ny = 1;
  const inv = 1 / Math.hypot(nx, ny, nz);
  return 1 - ny * inv; // 0 flat → 1 vertical
}

export function computeTerrainMeta(
  field: TerrainField,
  scatter: TerrainScatter,
  asteroidSeed: number,
  surfaceSeed: number,
): TerrainMeta {
  const { res, size, heights } = field;
  const coord = (idx: number) => (idx / (res - 1) - 0.5) * size;

  // Full-resolution stats.
  let maxSlope = 0;
  let flatCount = 0;
  const flatThresh = 0.12; // ~7°
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const s = slopeAt(field, i, j);
      if (s > maxSlope) maxSlope = s;
      if (s < flatThresh) flatCount++;
    }
  }

  // Coarse buildability grid (G×G): flat AND clear of rocks.
  const G = 64;
  const padRadius = size * 0.04;
  const rockClear = padRadius;
  // Mark cells occupied by a rock (plus its footprint).
  const occupied = new Uint8Array(G * G);
  const toG = (world: number) => Math.min(G - 1, Math.max(0, Math.round((world / size + 0.5) * (G - 1))));
  for (const inst of scatter.instances) {
    const gi = toG(inst.x);
    const gj = toG(inst.z);
    const r = Math.max(1, Math.round((inst.scale + rockClear) / size * (G - 1)));
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        const a = gi + di, b = gj + dj;
        if (a >= 0 && a < G && b >= 0 && b < G) occupied[b * G + a] = 1;
      }
    }
  }

  // Neighborhood planarity over the pad AREA (sparse ring sampling): mean slope +
  // RMS height deviation from the area mean. A ridge crest or inflection has a
  // near-ZERO point gradient (the old single-point metric parked landers exactly
  // there) but a large area deviation — this is what actually rejects crests.
  const cellSize = size / (res - 1);
  const areaStats = (fi: number, fj: number): { meanSlope: number; rms: number } => {
    const rCells = Math.max(2, Math.round(padRadius / cellSize));
    const clampI = (v: number) => Math.min(res - 1, Math.max(0, v));
    const pts: Array<[number, number]> = [[fi, fj]];
    for (const rr of [0.5, 1]) {
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + (rr === 1 ? Math.PI / 6 : 0);
        pts.push([
          clampI(Math.round(fi + Math.cos(a) * rCells * rr)),
          clampI(Math.round(fj + Math.sin(a) * rCells * rr)),
        ]);
      }
    }
    let slopeSum = 0;
    const hs: number[] = [];
    for (const [pi, pj] of pts) {
      slopeSum += slopeAt(field, pi, pj);
      hs.push(heights[pj * res + pi]!);
    }
    const mean = hs.reduce((s, v) => s + v, 0) / hs.length;
    const rms = Math.sqrt(hs.reduce((s, v) => s + (v - mean) ** 2, 0) / hs.length);
    return { meanSlope: slopeSum / pts.length, rms };
  };

  interface Cand { x: number; z: number; slope: number; score: number; }
  const collectCandidates = (respectRocks: boolean): Cand[] => {
    const out: Cand[] = [];
    for (let gj = 0; gj < G; gj++) {
      for (let gi = 0; gi < G; gi++) {
        if (respectRocks && occupied[gj * G + gi]) continue;
        const fi = Math.round((gi / (G - 1)) * (res - 1));
        const fj = Math.round((gj / (G - 1)) * (res - 1));
        const s = slopeAt(field, fi, fj);
        if (s >= flatThresh) continue;
        const { meanSlope, rms } = areaStats(fi, fj);
        const x = coord(fi), z = coord(fj);
        // Normalized deviation (rms per pad radius ≈ tangent of the area tilt) +
        // mean slope dominate; mild centrality preference breaks ties so the
        // best pads gravitate to the middle of the patch, not its corners.
        const centrality = Math.hypot(x, z) / size;
        const score = (rms / padRadius) * 3 + meanSlope * 2 + centrality * 0.15;
        out.push({ x, z, slope: meanSlope, score });
      }
    }
    out.sort((a, b) => a.score - b.score);
    return out;
  };

  // Greedy non-overlapping selection of the flattest spots.
  const selectPads = (cands: Cand[]): LandingPad[] => {
    const pads: LandingPad[] = [];
    for (const c of cands) {
      if (pads.length >= 8) break;
      if (pads.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < padRadius * 2)) continue;
      const fi = Math.min(res - 1, Math.max(0, Math.round((c.x / size + 0.5) * (res - 1))));
      const fj = Math.min(res - 1, Math.max(0, Math.round((c.z / size + 0.5) * (res - 1))));
      pads.push({ x: c.x, y: heights[fj * res + fi]!, z: c.z, radius: padRadius, slope: c.slope });
    }
    return pads;
  };

  // Prefer flat AND rock-free spots. On rocky surfaces (e.g. Bennu-class) every
  // flat cell may be near a rock, leaving none — fall back to the flattest cells
  // ignoring rock occupancy so there's always at least one landing pad (the
  // lander clears small rocks). flatFraction is high, so this always yields one.
  let landingPads = selectPads(collectCandidates(true));
  if (landingPads.length === 0) {
    landingPads = selectPads(collectCandidates(false));
  }

  return {
    asteroidSeed,
    surfaceSeed,
    footprint: size,
    resolution: res,
    landingPads,
    stats: {
      maxSlope,
      flatFraction: flatCount / (res * res),
      rockCount: scatter.instances.length,
      vertexCount: res * res,
      triCount: (res - 1) * (res - 1) * 2,
    },
  };
}
