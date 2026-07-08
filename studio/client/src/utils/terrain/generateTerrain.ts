/**
 * Terrain generation orchestrator.
 *
 * Ties the pieces together into one pure, deterministic function:
 *
 *   generateTerrain(style, params, surfaceSeed) -> { mesh, scatter }
 *
 * The asteroid is fixed via `style.asteroidSeed`. Every layer pulls an
 * independent sub-seed from deriveSeed(asteroidSeed, surfaceSeed, layer), so
 * changing `surfaceSeed` produces a brand-new but fully reproducible terrain
 * while the asteroid stays identical. This same function is what the headless
 * CLI / future game runtime call to mass-produce terrains.
 */

import type { MeshData } from "../meshModifiers";
import { deriveSeed } from "../prng";
import {
  applyBaseFbm,
  applyCraters,
  applyLines,
  applyMountains,
  applyThermalErosion,
  buildTerrainMesh,
  createField,
  type CraterLayerParams,
  type TerrainField,
} from "./terrainField";
import { scatterRocks, type TerrainScatter } from "./terrainScatter";
import { applyTerraces, applyScarps, applyHummocky, applyCellulite } from "./terrainFeatures";
import { computeTerrainMeta, type TerrainMeta } from "./terrainMeta";
import type { TerrainStyle } from "./terrainStyle";

export interface TerrainParams {
  /** World-space footprint side length. */
  footprint: number;
  /** Grid resolution (vertices per side). Higher = finer, no visible facets. */
  resolution: number;
  /** Crater count multiplier. */
  craterDensity: number;
  /** Rock instance multiplier. */
  rockDensity: number;
  /**
   * Detail amplification: extends feature counts toward the small scale to
   * fill the zoomed-in surface with fine craters/rocks the macro mesh lacked.
   */
  detailBoost: number;
  /** Mountain height multiplier (0 disables mountains). */
  mountainAmount: number;
  /** Mountain fold frequency multiplier (lower = wider folds, higher = finer). */
  mountainScale: number;
  /** Mountain coverage [0..1]: low = a few localized ranges with flat gaps, high = blanket. */
  mountainCoverage: number;
  /** Fold sharpness [0..1]: 1 = crisp ridgelines, 0 = smooth rounded mass. */
  foldSharpness: number;
  /** Inherited-fissure count multiplier (0 disables fissures). */
  fissureDensity: number;
  /** Inherited-ridge count multiplier (0 disables ridges). */
  ridgeDensity: number;
  /** Thermal erosion amount [0..1] — slumps over-steep slopes into scree. */
  erosion: number;
  // ── Optional landscape-variety features (0 = off; rolled per-site so no
  //    two sites carry the same subset — see scripts/generate-terrains.ts). ──
  /** Terrace/mesa blend strength [0..1]: stepped flat-topped plateaus. */
  terraceAmount?: number;
  /** Number of linear fault scarps (0 = none). */
  scarpDensity?: number;
  /** Hummocky-chaos strength [0..1]: small patches of knobbly blocky relief. */
  hummockAmount?: number;
  /** Talus/scree-apron strength [0..1]: extra debris at steep-slope feet. */
  talusAmount?: number;
  /** Cellulite strength [0..1]: soft rounded cellular texture in patches. */
  celluliteAmount?: number;
}

export const DEFAULT_TERRAIN_PARAMS: TerrainParams = {
  footprint: 40, // 2.0× reference tile
  resolution: 1280,
  craterDensity: 2,
  rockDensity: 1,
  detailBoost: 4,
  mountainAmount: 1,
  mountainScale: 1,
  mountainCoverage: 0.4,
  foldSharpness: 0.5,
  fissureDensity: 0.25,
  ridgeDensity: 0.25,
  erosion: 0.3,
};

export interface TerrainResult {
  mesh: MeshData;
  scatter: TerrainScatter;
  field: TerrainField;
  meta: TerrainMeta;
}

/** Layer indices — fixed so seeds stay stable across versions. */
const LAYER = {
  BASE: 1,
  MOUNTAINS: 2,
  CRATERS: 3,
  RIDGES: 4,
  FISSURES: 5,
  ROCKS: 6,
  REGIONAL: 7,
  TERRACES: 8,
  SCARPS: 9,
  HUMMOCKY: 10,
  CELLULITE: 11,
} as const;

export function generateTerrain(
  style: TerrainStyle,
  params: TerrainParams,
  surfaceSeed: number,
): TerrainResult {
  const { asteroidSeed } = style;
  const seed = (layer: number) => deriveSeed(asteroidSeed, surfaceSeed, layer);

  const res = Math.max(16, Math.round(params.resolution));
  const field = createField(res, params.footprint);

  // ── "Tiling" model ────────────────────────────────────────────────
  // As the footprint grows past the reference tile size, keep each feature's
  // ABSOLUTE size / height / wavelength constant and instead add MORE features
  // (count ∝ area). So a 2× footprint reads as 4 reference tiles stitched into a
  // square — not a zoomed-out view with bloated craters/ridges. `sizeAnchor`
  // cancels the footprint factor inside the layer fns so fractions map to a
  // constant absolute size; `area` multiplies the counts.
  const REF = 20;
  const tile = params.footprint / REF;
  const area = tile * tile;
  const sizeAnchor = 1 / tile;

  // ── Regional relief (large-scale STRUCTURE, wavelength ∝ footprint) ──
  // The tiling model below keeps every feature's ABSOLUTE wavelength constant, so
  // a wide patch fills with uniform all-over ripple and loses any sense of place.
  // This pass adds a FEW big undulations across the WHOLE patch (frequency is NOT
  // ×tile), so the surface reads as distinct REGIONS — high plateaus, low basins
  // and open plains — which the mountains/craters then decorate. Amplitude scales
  // with footprint so a small tile gets a single gentle swell, a wide one several.
  applyBaseFbm(
    field,
    {
      // BROAD + gentle: a couple of big undulations define a high PLATEAU here, a
      // low BASIN there, with wide near-level tops/floors — the large-scale sense
      // of place. Kept low-amplitude & low-frequency so it does NOT turn the whole
      // patch into rolling hills (that erased the flat ground); the roughness mask
      // on the detail pass below is what actually keeps plains flat.
      amplitude: params.footprint * 0.03,
      octaves: 2,
      lacunarity: 2.2,
      persistence: 0.5,
      frequency: 1.7,
      warp: 0.45,
    },
    seed(LAYER.REGIONAL),
  );

  // ── Base rolling terrain (roughness-MASKED) ───────────────────────
  // The fine detail is gated by a low-frequency mask: it drops to ZERO across
  // whole regions (genuinely FLAT plains) and rises to full elsewhere (broken,
  // rough ground) — restoring the "flat here, rough there" contrast a uniform
  // blanket of bumps had destroyed on wide patches.
  applyBaseFbm(
    field,
    {
      amplitude: style.base.amplitudeFrac * REF,
      octaves: style.base.octaves,
      lacunarity: style.base.lacunarity,
      persistence: style.base.persistence,
      frequency: style.base.frequency * tile, // constant wavelength across tiles
      warp: style.base.warp,
      roughMaskFreq: 2.6,
      edgeRise: 0.72, // flat centre for the base, hillier only toward the rim
    },
    seed(LAYER.BASE),
  );

  // ── Terraces / mesas (masked stepped plateaus) ────────────────────
  // Applied on the regional+base structure, BEFORE mountains/craters, so the
  // mesas are large-scale ground that later features decorate. Masked to ~1-2
  // zones so smooth plains remain elsewhere.
  if (params.terraceAmount && params.terraceAmount > 0) {
    applyTerraces(field, {
      stepHeight: params.footprint * 0.02,
      amount: params.terraceAmount,
      scarpWidth: 0.32,
      zoneFreq: 1.6,
      coverage: 0.4,
    }, seed(LAYER.TERRACES));
  }

  // ── Scarps / fault cliffs (a few linear down-drops) ───────────────
  if (params.scarpDensity && params.scarpDensity > 0) {
    applyScarps(field, {
      count: Math.round(params.scarpDensity),
      throwHeight: params.footprint * 0.03,
      faceWidth: 0.012,
      waviness: params.footprint * 0.03,
    }, seed(LAYER.SCARPS));
  }

  // ── Mountains ─────────────────────────────────────────────────────
  if (style.mountains && params.mountainAmount > 0) {
    applyMountains(
      field,
      {
        // Peak height scales with the FOOTPRINT (heightFrac is authored as a
        // fraction of the patch), NOT the reference tile — so a wide patch grows
        // genuine relief (tens of metres) instead of a stretched-thin bump. K is
        // trimmed (0.28→0.22) because the massif is now a rounded DOME (applyMountains
        // redesign) rather than a picket of narrow spikes — a dome of the old spike
        // height read as far too tall. Domed hills top out ~14-18% of the footprint.
        height: style.mountains.heightFrac * params.footprint * params.mountainAmount * 0.22,
        frequency: style.mountains.frequency * tile * params.mountainScale,
        octaves: style.mountains.octaves,
        // 1-2 big massifs — count does NOT grow with area (that carpeted wide
        // patches with dozens of little bumps); one or two large ranges to the SIDE
        // of the open centre reads as "mountains HERE, plain THERE". Capped at 2
        // (was 3) so massifs don't ring and crowd the whole patch.
        regions: Math.min(2, Math.max(1, Math.round(style.mountains.regions * params.mountainCoverage * 2.5))),
        sharpness: params.foldSharpness,
        // Keep a flat central disc (~40% of the footprint across) clear for the
        // landing pad + rig grid, so the pad never gets pushed to a corner.
        centerClear: params.footprint * 0.2,
      },
      seed(LAYER.MOUNTAINS),
    );
  }

  // ── Hummocky chaos (small masked patches of blocky relief) ────────
  // After mountains so it textures the plains between them; before craters so an
  // impact still flattens any chaos it lands on.
  if (params.hummockAmount && params.hummockAmount > 0) {
    applyHummocky(field, {
      amount: params.footprint * 0.014 * params.hummockAmount,
      frequency: 11,
      patchFreq: 3.2,
      coverage: 0.3,
    }, seed(LAYER.HUMMOCKY));
  }

  // ── Cellulite (soft rounded cellular texture in patches) ──────────
  // The organic "orange-peel" fine detail — a few dressed zones over the plains.
  if (params.celluliteAmount && params.celluliteAmount > 0) {
    applyCellulite(field, {
      amount: params.footprint * 0.01 * params.celluliteAmount,
      frequency: 10,
      warp: params.footprint * 0.04,
      patchFreq: 2.8,
      coverage: 0.4,
    }, seed(LAYER.CELLULITE));
  }

  // ── Craters (meteorite impacts: MIXED sizes, count ∝ √area) ──────
  if (style.craters) {
    const craters: CraterLayerParams = {
      ...style.craters,
      // Count grows with √area (not area) so a wide patch reads as a scattered
      // impact field, not a carpet of pits; density/detailBoost still tune it.
      // A FEW DOZEN distinct craters — NOT thousands. The old formula (×style.count
      // ×detailBoost) produced ~4000 pits per patch; once they were made deep
      // enough to see, that read as a carpet of overlapping concentric rings. Count
      // now scales only with density × √area → a readable impact field (small→big).
      count: Math.round(params.craterDensity * Math.sqrt(area) * 0.4),
      // Min size floored to ~0.7% of the patch (~1.5 m) so craters actually READ —
      // the tile-anchored min drifted to sub-metre specks that were invisible from
      // above, which is why "I see no craters". BIG ones scale with the footprint
      // for basin-class impacts; the flattened size-exponent (style) fills in the
      // visible MID range so the field reads as pockmarked, small→large.
      minSize: Math.max(0.007, (style.craters.minSize / Math.max(1, params.detailBoost)) * sizeAnchor),
      // Capped smaller again — the biggest impacts should be a clear feature, not
      // a basin spanning a third of the patch.
      maxSize: style.craters.maxSize * 0.8,
    };
    applyCraters(field, craters, seed(LAYER.CRATERS));
  }

  // ── Ridges (FEW linear features: count ∝ √area, not area) ─────────
  // Streak lines multiplied out of control at ∝ area — a wide patch was webbed
  // with them. √area keeps them as occasional accents, not an all-over network.
  if (style.ridges && params.ridgeDensity > 0) {
    const count = Math.max(0, Math.round(style.ridges.count * params.ridgeDensity * Math.sqrt(area)));
    if (count > 0) applyLines(field, {
      ...style.ridges, count,
      amount: style.ridges.amount * sizeAnchor,
      width: style.ridges.width * sizeAnchor,
      length: style.ridges.length * sizeAnchor,
    }, seed(LAYER.RIDGES));
  }

  // ── Fissures → shallow grooves (rare; NO deep canyons) ────────────
  // Deep "canyon" trenches read badly, so density is near-zero in the variants and
  // the depth multiplier is modest — any survivor is a shallow hairline groove, at
  // most one on a patch, not a map-splitting rift.
  if (style.fissures && params.fissureDensity > 0) {
    const count = Math.max(0, Math.round(style.fissures.count * params.fissureDensity * Math.sqrt(area)));
    if (count > 0) applyLines(field, {
      ...style.fissures, count,
      amount: style.fissures.amount * 2.0,
      width: style.fissures.width * 1.5,
      length: style.fissures.length * 1.2,
    }, seed(LAYER.FISSURES));
  }

  // ── Thermal erosion (after all relief is laid down) ───────────────
  if (params.erosion > 0) {
    applyThermalErosion(field, {
      iterations: Math.round(params.erosion * 30),
      talus: 1.2,
      strength: 0.5,
    });
  }

  const mesh = buildTerrainMesh(field);

  // ── Scattered rocks (instances, not merged) ───────────────────────
  let scatter: TerrainScatter = { templates: [], instances: [] };
  if (style.rocks && params.rockDensity > 0) {
    scatter = scatterRocks(
      field,
      style.rocks,
      {
        count: Math.round(style.rocks.count * params.rockDensity * params.detailBoost * area),
        // WIDE size range — from small pebbles up to metre+ boulders — so the
        // scatter reads varied, not a uniform gravel. Anchored to the tile (stable
        // absolute sizes as the footprint grows); the power-law in scatterRocks
        // keeps most small with a scattering of big ones.
        minSize: style.rocks.minSize * 0.15 * sizeAnchor,
        maxSize: style.rocks.maxSize * 2.4 * sizeAnchor,
        embed: 0.3,
        talus: params.talusAmount ?? 0,
      },
      seed(LAYER.ROCKS),
    );
  }

  const meta = computeTerrainMeta(field, scatter, asteroidSeed, surfaceSeed);

  return { mesh, scatter, field, meta };
}
