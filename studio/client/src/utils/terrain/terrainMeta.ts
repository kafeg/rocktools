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
  /** Base-camp area TILT (plane-fit gradient magnitude, 0 = level). */
  slope: number;
  /** Max |residual| off the fitted plane inside the camp window (local units) — a
   *  single ridge crossing the window shows here even when RMS smooths it out. */
  roughness?: number;
  /** Mean height of the camp window MINUS the patch median (local units) — a flat
   *  hilltop or pit bottom is "locally perfect" but globally wrong. */
  prominence?: number;
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

  // ── BASE-CAMP WINDOW EVALUATION ──────────────────────────────────────
  // A pad is judged not by a single point but by a WINDOW the size of the rig
  // grid that will surround it (~the whole buildable footprint, "or slightly
  // more"), via a fitted INCLINED PLANE. Three failure modes the old mean/RMS
  // metric conflated are separated and each penalized independently:
  //   tilt       — the window is a smooth SLOPE (locally "flat" but inclined);
  //   maxAbs     — a RIDGE/gully crosses the window (RMS averages a single crest
  //                into mild noise; the max residual off the plane does not);
  //   prominence — a flat HILLTOP or pit: locally perfect, but its mean height
  //                stands off the PATCH MEDIAN. This is the "flat relative to the
  //                WHOLE surface, not to whatever slope it sits on" normalization
  //                the design calls for — it is what rejects landing a base on the
  //                one isolated mountain whose summit happens to be level.
  const cellSize = size / (res - 1);
  // Window radius ≈ the consumer's rig-grid RADIUS (~22 m) plus margin — a pad is
  // judged over the area the BASE actually occupies, not the whole patch. Capped
  // at 40 m so a wide (250-350 m) patch doesn't judge flatness over a 90 m+ window
  // (which would reject good central spots for distant relief the base never sees).
  const evalR = Math.min(40, Math.max(24, size * 0.35));
  const rCells = Math.max(4, Math.round(evalR / cellSize));

  // Patch median height — the "whole surface" reference for prominence. A robust
  // level line for the entire patch, sampled coarsely (every 8th cell).
  const hSample: number[] = [];
  for (let j = 0; j < res; j += 8) {
    for (let i = 0; i < res; i += 8) hSample.push(heights[j * res + i]!);
  }
  hSample.sort((a, b) => a - b);
  const patchMedian = hSample[Math.floor(hSample.length / 2)]!;

  interface AreaFit { tilt: number; rms: number; maxAbs: number; prominence: number }
  const areaFit = (fi: number, fj: number): AreaFit => {
    const clampI = (v: number) => Math.min(res - 1, Math.max(0, v));
    // Polar sample grid: center + 4 rings × 8 spokes = 33 points across the window.
    const xs: number[] = [0];
    const zs: number[] = [0];
    const hs: number[] = [heights[clampI(fj) * res + clampI(fi)]!];
    for (const rr of [0.25, 0.5, 0.75, 1]) {
      for (let k = 0; k < 8; k++) {
        const a = (Math.PI / 4) * k + rr * 0.7; // stagger rings so spokes don't align
        const dx = Math.cos(a) * rCells * rr;
        const dz = Math.sin(a) * rCells * rr;
        xs.push(dx * cellSize);
        zs.push(dz * cellSize);
        hs.push(heights[clampI(Math.round(fj + dz)) * res + clampI(Math.round(fi + dx))]!);
      }
    }
    // Least-squares plane h ≈ a·x + b·z + c over the window (centered normal eqs).
    const n = hs.length;
    let sx = 0, sz = 0, sh = 0, sxx = 0, szz = 0, sxz = 0, sxh = 0, szh = 0;
    for (let i = 0; i < n; i++) {
      sx += xs[i]!; sz += zs[i]!; sh += hs[i]!;
      sxx += xs[i]! * xs[i]!; szz += zs[i]! * zs[i]!; sxz += xs[i]! * zs[i]!;
      sxh += xs[i]! * hs[i]!; szh += zs[i]! * hs[i]!;
    }
    const mx = sx / n, mz = sz / n, mh = sh / n;
    const cxx = sxx / n - mx * mx, czz = szz / n - mz * mz, cxz = sxz / n - mx * mz;
    const cxh = sxh / n - mx * mh, czh = szh / n - mz * mh;
    const det = cxx * czz - cxz * cxz;
    const a = det > 1e-9 ? (cxh * czz - czh * cxz) / det : 0;
    const b = det > 1e-9 ? (czh * cxx - cxh * cxz) / det : 0;
    let ss = 0, maxAbs = 0;
    for (let i = 0; i < n; i++) {
      const r = hs[i]! - (a * (xs[i]! - mx) + b * (zs[i]! - mz) + mh);
      ss += r * r;
      if (Math.abs(r) > maxAbs) maxAbs = Math.abs(r);
    }
    return { tilt: Math.hypot(a, b), rms: Math.sqrt(ss / n), maxAbs, prominence: mh - patchMedian };
  };

  const scoreFit = (f: AreaFit, x: number, z: number): number => {
    const centrality = Math.hypot(x, z) / size;
    return (
      f.tilt * 8                             // reject smooth slopes
      + (f.rms / evalR) * 6                  // reject general bumpiness
      + (f.maxAbs / evalR) * 5               // reject a ridge crossing the window
      + (Math.abs(f.prominence) / size) * 8  // reject hilltops/pits off the patch median
      + centrality * 2.5                     // STRONG centre preference: the pad must
                                             // sit near the middle (the camera frames
                                             // it and can't leave the patch) — a
                                             // slightly bumpier central spot beats a
                                             // pristine corner. The mountain keep-out
                                             // guarantees the centre is genuinely flat.
    );
  };

  interface Cand { x: number; z: number; fit: AreaFit; score: number; }
  const collectCandidates = (respectRocks: boolean): Cand[] => {
    const out: Cand[] = [];
    for (let gj = 0; gj < G; gj++) {
      for (let gi = 0; gi < G; gi++) {
        if (respectRocks && occupied[gj * G + gi]) continue;
        const fi = Math.round((gi / (G - 1)) * (res - 1));
        const fj = Math.round((gj / (G - 1)) * (res - 1));
        if (slopeAt(field, fi, fj) >= flatThresh) continue; // cheap point pre-filter
        const x = coord(fi), z = coord(fj);
        const fit = areaFit(fi, fj);
        out.push({ x, z, fit, score: scoreFit(fit, x, z) });
      }
    }
    out.sort((a, b) => a.score - b.score);
    return out;
  };

  // Greedy non-overlapping selection of the flattest windows. Spacing scales with
  // the eval window (not the tiny pad disc) so the pads spread across distinct flat
  // regions instead of clustering in one basin. Centre-weighted scoring orders them
  // flattest-and-most-central first. Up to 10 candidates so the RUNTIME picker
  // (choosePad) has real choice — only ONE is ever rendered (the grid centre), so
  // extra candidates cost nothing visually but let it dodge a crater rim for a
  // genuinely flat plain a few metres over.
  const selectPads = (cands: Cand[]): LandingPad[] => {
    const spacing = evalR * 0.4;
    const pads: LandingPad[] = [];
    for (const c of cands) {
      if (pads.length >= 10) break;
      if (pads.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < spacing)) continue;
      const fi = Math.min(res - 1, Math.max(0, Math.round((c.x / size + 0.5) * (res - 1))));
      const fj = Math.min(res - 1, Math.max(0, Math.round((c.z / size + 0.5) * (res - 1))));
      pads.push({
        x: c.x, y: heights[fj * res + fi]!, z: c.z, radius: padRadius,
        slope: c.fit.tilt, roughness: c.fit.maxAbs, prominence: c.fit.prominence,
      });
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
