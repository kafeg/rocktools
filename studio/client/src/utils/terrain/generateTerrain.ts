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
    },
    seed(LAYER.BASE),
  );

  // ── Mountains ─────────────────────────────────────────────────────
  if (style.mountains && params.mountainAmount > 0) {
    applyMountains(
      field,
      {
        // Peak height scales with the FOOTPRINT (heightFrac is authored as a
        // fraction of the patch), NOT the reference tile — so a wide patch grows
        // genuinely TALL ridges (tens of metres) instead of the same ~10 m bump
        // stretched thin into a gentle hill. This is what brings back the dramatic
        // massifs the small tiles had; K keeps the tallest around ~25-30% of width.
        height: style.mountains.heightFrac * params.footprint * params.mountainAmount * 0.24,
        frequency: style.mountains.frequency * tile * params.mountainScale,
        octaves: style.mountains.octaves,
        // 1-3 big massifs — count does NOT grow with area (that carpeted wide
        // patches with dozens of little bumps); a handful of large ranges ringing
        // the open centre reads as "mountains HERE, plain THERE".
        regions: Math.min(3, Math.max(1, Math.round(style.mountains.regions * params.mountainCoverage * 2.5))),
        sharpness: params.foldSharpness,
      },
      seed(LAYER.MOUNTAINS),
    );
  }

  // ── Craters (meteorite impacts: MIXED sizes, count ∝ √area) ──────
  if (style.craters) {
    const craters: CraterLayerParams = {
      ...style.craters,
      // Count grows with √area (not area) so a wide patch reads as a scattered
      // impact field, not a carpet of pits; density/detailBoost still tune it.
      count: Math.round(style.craters.count * params.craterDensity * params.detailBoost * Math.sqrt(area) * 1.6),
      // Small craters stay tile-anchored (fine detail); BIG ones scale with the
      // FOOTPRINT (no anchor) so real basin-class impacts appear on a wide patch.
      // sizeExponent (style) keeps most small with a few large — a natural field.
      minSize: (style.craters.minSize / Math.max(1, params.detailBoost)) * sizeAnchor,
      maxSize: style.craters.maxSize * 2.4,
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
        maxSize: style.rocks.maxSize * 3.2 * sizeAnchor,
        embed: 0.3,
      },
      seed(LAYER.ROCKS),
    );
  }

  const meta = computeTerrainMeta(field, scatter, asteroidSeed, surfaceSeed);

  return { mesh, scatter, field, meta };
}
