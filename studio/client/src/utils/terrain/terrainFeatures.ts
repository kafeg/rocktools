/**
 * Optional LANDSCAPE-VARIETY features, composited into the height grid like the
 * core layers in terrainField.ts but each strongly MASKED so it decorates only
 * PART of a patch — never a blanket. The per-site generator rolls a SUBSET of
 * these per landing site (see scripts/generate-terrains.ts), so no two sites look
 * alike and none carries all of them at once.
 *
 *   applyTerraces  — stepped, flat-topped plateaus (mesas) with scarp edges
 *   applyScarps    — sharp linear fault cliffs (a down-dropped block)
 *   applyHummocky  — small patches of knobbly, chaotic blocky relief
 *   applyCellulite — soft rounded cellular texture (orange-peel / dimpled)
 *
 * All are pure functions of the existing height grid + a seed (deterministic).
 * Each early-outs when its amount is 0, so an "off" feature costs one branch.
 */

import { mulberry32 } from "../prng";
import { makeNoise2D, fbm, ridged, type FbmOptions } from "./noise";
import { coord, smoothstep, type TerrainField } from "./terrainField";

// ── Terraces / mesas ─────────────────────────────────────────────────

export interface TerraceParams {
  /** Vertical step (world units) between plateau levels. */
  stepHeight: number;
  /** Blend 0..1 of the terraced surface over the original, within a zone. */
  amount: number;
  /** Fraction 0..1 of each step given to the scarp face (rest is flat top). */
  scarpWidth: number;
  /** Zone-mask frequency (cycles across the patch) — selects WHERE it applies. */
  zoneFreq: number;
  /** Zone coverage 0..1 (higher = more of the patch terraced). */
  coverage: number;
}

/**
 * Quantise the existing relief into stepped, flat-topped plateaus inside a masked
 * zone. The mask (a low-frequency field thresholded by `coverage`) keeps it to
 * ~1-2 regions so the rest of the patch stays smooth. Within the zone the height
 * snaps toward the nearest level over most of each step (the flat top) and keeps a
 * sliver of the original only near the boundary (a steep, finite scarp face) —
 * where the underlying slope crosses a level, that scarp becomes a mesa edge.
 */
export function applyTerraces(field: TerrainField, p: TerraceParams, seed: number): void {
  if (p.amount <= 0 || p.stepHeight <= 0) return;
  const { res, size, heights } = field;
  const nZone = makeNoise2D(seed ^ 0x9e3779b1);
  const zoneOpts: FbmOptions = { octaves: 2, lacunarity: 2, persistence: 0.5, frequency: p.zoneFreq / size };
  const step = p.stepHeight;
  // Top band of each step that stays perfectly flat (the plateau); the remainder
  // is the scarp face where the original slope shows through.
  const flatHalf = (1 - Math.min(0.9, Math.max(0.05, p.scarpWidth))) * 0.5;
  for (let j = 0; j < res; j++) {
    const z = coord(j, res, size);
    for (let i = 0; i < res; i++) {
      const x = coord(i, res, size);
      const m = fbm(nZone, x, z, zoneOpts) * 0.5 + 0.5;
      const zone = smoothstep(1 - p.coverage, 1 - p.coverage + 0.15, m);
      if (zone <= 0) continue;
      const idx = j * res + i;
      const h = heights[idx]!;
      const q = Math.round(h / step) * step;     // nearest plateau level
      const d = (h - q) / step;                  // -0.5..0.5, signed steps from it
      const edge = smoothstep(flatHalf, 0.5, Math.abs(d)); // 0 flat top → 1 at scarp
      const terraced = q + d * step * edge;
      heights[idx] = h + (terraced - h) * zone * p.amount;
    }
  }
}

// ── Scarps / fault cliffs ────────────────────────────────────────────

export interface ScarpParams {
  /** Number of fault scarps. */
  count: number;
  /** Vertical throw (world units) of the down-dropped side. */
  throwHeight: number;
  /** Scarp-face half-width as a fraction of footprint (smaller = steeper cliff). */
  faceWidth: number;
  /** Along-fault lateral wander (world units) so the cliff isn't dead straight. */
  waviness: number;
}

/**
 * Drop the terrain on one side of a fault line by `throwHeight` over a narrow face
 * — a linear cliff, distinct from a ridge (which is a symmetric bump). The fault
 * is a finite segment (a point + direction, windowed along its length and faded at
 * the ends) with low-frequency lateral wander so it reads as a natural scarp.
 */
export function applyScarps(field: TerrainField, p: ScarpParams, seed: number): void {
  if (p.count <= 0 || p.throwHeight <= 0) return;
  const { res, size, heights } = field;
  const rand = mulberry32(seed);
  const nWave = makeNoise2D(seed ^ 0x27d4eb2f);
  const faceHalf = Math.max(1e-3, p.faceWidth * size);
  const waveOpts: FbmOptions = { octaves: 2, lacunarity: 2, persistence: 0.5, frequency: 2.5 / size };
  for (let k = 0; k < p.count; k++) {
    const px = (rand() - 0.5) * size * 0.5;
    const pz = (rand() - 0.5) * size * 0.5;
    const ang = rand() * Math.PI * 2;
    const dx = Math.cos(ang), dz = Math.sin(ang);   // along the fault
    const nx = -dz, nz = dx;                         // perpendicular (side test)
    const halfLen = size * (0.3 + rand() * 0.3);     // finite segment
    const throwK = p.throwHeight * (0.6 + rand() * 0.8);
    for (let j = 0; j < res; j++) {
      const z = coord(j, res, size);
      for (let i = 0; i < res; i++) {
        const x = coord(i, res, size);
        const rx = x - px, rz = z - pz;
        const along = rx * dx + rz * dz;
        if (Math.abs(along) > halfLen) continue;      // outside the segment
        const wob = fbm(nWave, x, z, waveOpts) * p.waviness;
        const s = rx * nx + rz * nz + wob;            // signed distance to the face
        const drop = smoothstep(-faceHalf, faceHalf, s); // 0 high side → 1 low side
        const endFade = 1 - smoothstep(halfLen * 0.7, halfLen, Math.abs(along));
        const idx = j * res + i;
        heights[idx] = heights[idx]! - throwK * drop * endFade;
      }
    }
  }
}

// ── Hummocky chaos zones ─────────────────────────────────────────────

export interface HummockyParams {
  /** Bump amplitude (world units). */
  amount: number;
  /** Blocky frequency (cycles across the patch) — high = small knobbly lumps. */
  frequency: number;
  /** Patch-mask frequency (cycles across the patch). */
  patchFreq: number;
  /** Patch coverage 0..1 (low = a few small chaos patches). */
  coverage: number;
}

/**
 * Sprinkle small patches of knobbly, chaotic blocky relief onto otherwise smooth
 * ground — the `|fbm|` field gives lumps with sharp creases between, gated by a
 * sparse patch mask so it appears as a few broken zones, not everywhere. Kept
 * low-amplitude so it's surface texture, not a second mountain range.
 */
export function applyHummocky(field: TerrainField, p: HummockyParams, seed: number): void {
  if (p.amount <= 0) return;
  const { res, size, heights } = field;
  const nBlock = makeNoise2D(seed ^ 0x165667b1);
  const nPatch = makeNoise2D(seed ^ 0xc2b2ae35);
  const blockOpts: FbmOptions = { octaves: 3, lacunarity: 2.2, persistence: 0.55, frequency: p.frequency / size };
  const patchOpts: FbmOptions = { octaves: 2, lacunarity: 2, persistence: 0.5, frequency: p.patchFreq / size };
  for (let j = 0; j < res; j++) {
    const z = coord(j, res, size);
    for (let i = 0; i < res; i++) {
      const x = coord(i, res, size);
      const pm = fbm(nPatch, x, z, patchOpts) * 0.5 + 0.5;
      const patch = smoothstep(1 - p.coverage, 1 - p.coverage + 0.12, pm);
      if (patch <= 0) continue;
      // |fbm| ∈ [0,1): knobbly lumps; shift so it both lifts and pits slightly.
      const b = Math.abs(fbm(nBlock, x, z, blockOpts));
      const idx = j * res + i;
      heights[idx] = heights[idx]! + (b - 0.4) * p.amount * patch;
    }
  }
}

// ── Cellulite / rounded cellular texture ─────────────────────────────

export interface CelluliteParams {
  /** Bump/dimple amplitude (world units). */
  amount: number;
  /** Cellular frequency (cycles across the patch) — higher = finer dimples. */
  frequency: number;
  /** Domain-warp strength (world units) so the cells aren't a regular grid. */
  warp: number;
  /** Patch-mask frequency (cycles across the patch). */
  patchFreq: number;
  /** Patch coverage 0..1 (low = a few cellulite patches). */
  coverage: number;
}

/**
 * Dense rounded "cellulite" texture — a domain-warped ridged field gives connected
 * rounded lumps with soft dimples between (the orange-peel / brain-coral look),
 * gated by a patch mask so it dresses a few zones, not the whole patch. Distinct
 * from applyHummocky's sharp |fbm| chaos: this is soft and organic, the fine-scale
 * variety that reads so well across a regolith surface. Kept low-amplitude so it
 * textures the ground rather than reshaping it.
 */
export function applyCellulite(field: TerrainField, p: CelluliteParams, seed: number): void {
  if (p.amount <= 0) return;
  const { res, size, heights } = field;
  const nCell = makeNoise2D(seed ^ 0x2545f491);
  const nWx = makeNoise2D(seed ^ 0x9e3779b9);
  const nWy = makeNoise2D(seed ^ 0x85ebca77);
  const nPatch = makeNoise2D(seed ^ 0xc2b2ae3d);
  const cellOpts: FbmOptions = { octaves: 3, lacunarity: 2.1, persistence: 0.55, frequency: p.frequency / size };
  const warpOpts: FbmOptions = { octaves: 2, lacunarity: 2, persistence: 0.5, frequency: (p.frequency * 0.5) / size };
  const patchOpts: FbmOptions = { octaves: 2, lacunarity: 2, persistence: 0.5, frequency: p.patchFreq / size };
  for (let j = 0; j < res; j++) {
    const z = coord(j, res, size);
    for (let i = 0; i < res; i++) {
      const x = coord(i, res, size);
      const pm = fbm(nPatch, x, z, patchOpts) * 0.5 + 0.5;
      const patch = smoothstep(1 - p.coverage, 1 - p.coverage + 0.14, pm);
      if (patch <= 0) continue;
      const wx = fbm(nWx, x, z, warpOpts) * p.warp;
      const wz = fbm(nWy, x, z, warpOpts) * p.warp;
      // Rounded cellular crests with dips between → cellulite. Centred so it both
      // lifts (lumps) and pits (dimples) around the local ground level.
      const c = ridged(nCell, x + wx, z + wz, cellOpts) - 0.42;
      const idx = j * res + i;
      heights[idx] = heights[idx]! + c * p.amount * patch;
    }
  }
}

// ── Regolith ponds (flat dust fills in the low ground) ───────────────

export interface PondParams {
  /** How many ponds to attempt across the patch. */
  count: number;
  /** Pond radius as a fraction of the footprint. */
  radius: number;
  /** Rim softness as a fraction of the radius — 0 is a stamped edge. */
  feather: number;
  /**
   * Where inside the pond the dust settles, as a fraction of the local relief
   * measured from its lowest point. 0 fills to the floor, 1 to the rim.
   */
  level: number;
  /** Candidate sites tried per pond; the lowest-lying one wins. */
  probes: number;
}

/**
 * Ponded regolith: a dead-flat deposit of fine dust lying in the low ground, the
 * way it does on Eros — a crater with a mirror-smooth floor inside an otherwise
 * broken surface. This is the airless-body answer to dunes, which cannot form
 * here at all: dunes need wind, and there is no atmosphere to supply it. What
 * moves dust around instead is seismic shaking from impacts, which settles it
 * into whatever hollow is nearest, level to the local gravity.
 *
 * Gameplay earns its place too: a pond is the flattest ground on a patch, so the
 * factory's hex grid has somewhere to sit that is not a compromise.
 *
 * Each pond probes a few candidate centres and takes the lowest-lying one, so the
 * dust lands in hollows rather than on slopes. Cells already above the fill line
 * are untouched — the pond fills, it never excavates.
 */
export function applyPonds(field: TerrainField, p: PondParams, seed: number): void {
  if (p.count <= 0 || p.radius <= 0) return;
  const { res, size, heights } = field;
  const rand = mulberry32(seed);
  const radius = p.radius * size;
  const half = size / 2;

  /** Mean height in a coarse sample of the disc — cheap "how low is this spot". */
  const sampleMean = (cx: number, cz: number): number => {
    let sum = 0, n = 0;
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      for (const f of [0, 0.5, 0.9]) {
        const x = cx + Math.cos(ang) * radius * f;
        const z = cz + Math.sin(ang) * radius * f;
        const i = Math.round(((x + half) / size) * (res - 1));
        const j = Math.round(((z + half) / size) * (res - 1));
        if (i < 0 || j < 0 || i >= res || j >= res) continue;
        sum += heights[j * res + i]!; n++;
      }
    }
    return n ? sum / n : Infinity;
  };

  for (let k = 0; k < p.count; k++) {
    let cx = 0, cz = 0, best = Infinity;
    for (let t = 0; t < Math.max(1, p.probes); t++) {
      const x = (rand() - 0.5) * (size - 2 * radius);
      const z = (rand() - 0.5) * (size - 2 * radius);
      const m = sampleMean(x, z);
      if (m < best) { best = m; cx = x; cz = z; }
    }

    // Fill line: the local floor plus a slice of the local relief.
    let lo = Infinity, hi = -Infinity;
    const i0 = Math.max(0, Math.floor(((cx - radius + half) / size) * (res - 1)));
    const i1 = Math.min(res - 1, Math.ceil(((cx + radius + half) / size) * (res - 1)));
    const j0 = Math.max(0, Math.floor(((cz - radius + half) / size) * (res - 1)));
    const j1 = Math.min(res - 1, Math.ceil(((cz + radius + half) / size) * (res - 1)));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = coord(i, res, size), z = coord(j, res, size);
        if (Math.hypot(x - cx, z - cz) > radius) continue;
        const h = heights[j * res + i]!;
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    }
    if (!isFinite(lo)) continue;
    const fill = lo + (hi - lo) * p.level;

    const feather = Math.max(1e-6, p.feather) * radius;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = coord(i, res, size), z = coord(j, res, size);
        const d = Math.hypot(x - cx, z - cz);
        if (d > radius) continue;
        const idx = j * res + i;
        const h = heights[idx]!;
        if (h >= fill) continue;                       // a pond fills, never digs
        const edge = smoothstep(radius, radius - feather, d);
        heights[idx] = h + (fill - h) * edge;
      }
    }
  }
}
