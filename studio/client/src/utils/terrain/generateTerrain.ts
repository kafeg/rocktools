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
  /** Inherited-fissure count multiplier (0 disables fissures). */
  fissureDensity: number;
  /** Inherited-ridge count multiplier (0 disables ridges). */
  ridgeDensity: number;
  /** Thermal erosion amount [0..1] — slumps over-steep slopes into scree. */
  erosion: number;
}

export const DEFAULT_TERRAIN_PARAMS: TerrainParams = {
  footprint: 20,
  resolution: 768,
  craterDensity: 1.5,
  rockDensity: 4,
  detailBoost: 4,
  mountainAmount: 1.5,
  fissureDensity: 1,
  ridgeDensity: 1,
  erosion: 0.4,
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

  // ── Base rolling terrain ──────────────────────────────────────────
  applyBaseFbm(
    field,
    {
      amplitude: style.base.amplitudeFrac * params.footprint,
      octaves: style.base.octaves,
      lacunarity: style.base.lacunarity,
      persistence: style.base.persistence,
      frequency: style.base.frequency,
      warp: style.base.warp,
    },
    seed(LAYER.BASE),
  );

  // ── Mountains ─────────────────────────────────────────────────────
  if (style.mountains && params.mountainAmount > 0) {
    applyMountains(
      field,
      {
        height: style.mountains.heightFrac * params.footprint * params.mountainAmount,
        frequency: style.mountains.frequency,
        octaves: style.mountains.octaves,
        regions: style.mountains.regions,
      },
      seed(LAYER.MOUNTAINS),
    );
  }

  // ── Craters (count amplified by density + detail boost) ───────────
  if (style.craters) {
    const craters: CraterLayerParams = {
      ...style.craters,
      count: Math.round(style.craters.count * params.craterDensity * params.detailBoost),
      // Extend the size range downward to add fine craters on zoom-in.
      minSize: style.craters.minSize / Math.max(1, params.detailBoost),
    };
    applyCraters(field, craters, seed(LAYER.CRATERS));
  }

  // ── Ridges (count scaled by ridgeDensity; 0 disables) ─────────────
  if (style.ridges && params.ridgeDensity > 0) {
    const count = Math.max(0, Math.round(style.ridges.count * params.ridgeDensity));
    if (count > 0) applyLines(field, { ...style.ridges, count }, seed(LAYER.RIDGES));
  }

  // ── Fissures (count scaled by fissureDensity; 0 disables) ─────────
  if (style.fissures && params.fissureDensity > 0) {
    const count = Math.max(0, Math.round(style.fissures.count * params.fissureDensity));
    if (count > 0) applyLines(field, { ...style.fissures, count }, seed(LAYER.FISSURES));
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
        count: Math.round(style.rocks.count * params.rockDensity * params.detailBoost),
        // Rocks are small relative to the patch (this is a zoomed-in view).
        minSize: style.rocks.minSize * 0.4,
        maxSize: style.rocks.maxSize * 0.4,
        embed: 0.3,
      },
      seed(LAYER.ROCKS),
    );
  }

  const meta = computeTerrainMeta(field, scatter, asteroidSeed, surfaceSeed);

  return { mesh, scatter, field, meta };
}
