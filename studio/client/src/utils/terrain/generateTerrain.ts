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

  // ── Base rolling terrain ──────────────────────────────────────────
  applyBaseFbm(
    field,
    {
      amplitude: style.base.amplitudeFrac * REF,
      octaves: style.base.octaves,
      lacunarity: style.base.lacunarity,
      persistence: style.base.persistence,
      frequency: style.base.frequency * tile, // constant wavelength across tiles
      warp: style.base.warp,
    },
    seed(LAYER.BASE),
  );

  // ── Mountains ─────────────────────────────────────────────────────
  if (style.mountains && params.mountainAmount > 0) {
    applyMountains(
      field,
      {
        height: style.mountains.heightFrac * REF * params.mountainAmount,
        frequency: style.mountains.frequency * tile * params.mountainScale,
        octaves: style.mountains.octaves,
        // Region count grows with √area (not area) and Coverage, so big patches
        // get more ranges but keep flat gaps between them (instead of a blanket).
        regions: Math.max(1, Math.round(style.mountains.regions * Math.sqrt(area) * params.mountainCoverage * 2.2)),
        sharpness: params.foldSharpness,
      },
      seed(LAYER.MOUNTAINS),
    );
  }

  // ── Craters (count ∝ area, sizes anchored to the reference tile) ──
  if (style.craters) {
    const craters: CraterLayerParams = {
      ...style.craters,
      count: Math.round(style.craters.count * params.craterDensity * params.detailBoost * area),
      // Extend the size range downward to add fine craters on zoom-in.
      minSize: (style.craters.minSize / Math.max(1, params.detailBoost)) * sizeAnchor,
      maxSize: style.craters.maxSize * sizeAnchor,
    };
    applyCraters(field, craters, seed(LAYER.CRATERS));
  }

  // ── Ridges (count scaled by ridgeDensity × area; 0 disables) ──────
  if (style.ridges && params.ridgeDensity > 0) {
    const count = Math.max(0, Math.round(style.ridges.count * params.ridgeDensity * area));
    if (count > 0) applyLines(field, {
      ...style.ridges, count,
      amount: style.ridges.amount * sizeAnchor,
      width: style.ridges.width * sizeAnchor,
      length: style.ridges.length * sizeAnchor,
    }, seed(LAYER.RIDGES));
  }

  // ── Fissures (count scaled by fissureDensity × area; 0 disables) ──
  if (style.fissures && params.fissureDensity > 0) {
    const count = Math.max(0, Math.round(style.fissures.count * params.fissureDensity * area));
    if (count > 0) applyLines(field, {
      ...style.fissures, count,
      amount: style.fissures.amount * sizeAnchor,
      width: style.fissures.width * sizeAnchor,
      length: style.fissures.length * sizeAnchor,
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
        // Rocks are small relative to the patch; sizes anchored to the tile so
        // they stay the same absolute size as the footprint grows.
        minSize: style.rocks.minSize * 0.4 * sizeAnchor,
        maxSize: style.rocks.maxSize * 0.4 * sizeAnchor,
        embed: 0.3,
      },
      seed(LAYER.ROCKS),
    );
  }

  const meta = computeTerrainMeta(field, scatter, asteroidSeed, surfaceSeed);

  return { mesh, scatter, field, meta };
}
