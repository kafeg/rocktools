/**
 * Terrain style inheritance.
 *
 * A terrain must look like a *piece of the current asteroid* — same craters,
 * ridges, fissures, rock character. We achieve that by deriving a TerrainStyle
 * from the asteroid's own pipeline (its mesh: modifier params + base seed).
 * Only the SEED varies between terrain variants; the style (and therefore the
 * asteroid) is untouched. fx:* shading params are handled separately by the
 * existing collectShaderParams()/AsteroidMaterial path, so the terrain renders
 * with the identical material.
 */

import type { PipelineStep } from "../../types";
import type { CraterLayerParams, LineLayerParams } from "./terrainField";

export interface BaseStyle {
  /** Rolling-hills amplitude as a fraction of footprint. */
  amplitudeFrac: number;
  octaves: number;
  lacunarity: number;
  persistence: number;
  /** Cycles across the footprint. */
  frequency: number;
  warp: number;
}

export interface MountainStyle {
  /** Peak height as a fraction of footprint. */
  heightFrac: number;
  frequency: number;
  octaves: number;
  /** Number of distinct mountain regions (rest of the patch stays flatter). */
  regions: number;
}

export interface RockStyle {
  count: number;
  minSize: number;
  maxSize: number;
  roughness: number;
  detail: number;
  templates: number;
}

export interface TerrainStyle {
  /** Fixed asteroid seed — terrain seeds are derived from this + surfaceSeed. */
  asteroidSeed: number;
  base: BaseStyle;
  mountains: MountainStyle | null;
  craters: CraterLayerParams | null;
  ridges: LineLayerParams | null;
  fissures: LineLayerParams | null;
  rocks: RockStyle;
}

function findStep(steps: PipelineStep[], tool: string): PipelineStep | undefined {
  return steps.find((s) => s.tool === tool && s.enabled !== false);
}

function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Derive a footprint-independent style from the asteroid pipeline. All heights
 * are expressed as fractions of the footprint so the same style works at any
 * terrain size.
 */
export function deriveTerrainStyle(
  steps: PipelineStep[],
  createParams: Record<string, number | string | boolean>,
): TerrainStyle {
  const asteroidSeed = num(createParams.seed, 1);

  const detail = findStep(steps, "rockdetail");
  const np = num(detail?.params.normalPerturbation, 0.2);
  const depth = num(detail?.params.depth, 4);
  const ne = num(detail?.params.normalExponent, 0.5);

  // Gentler base so the patch has relatively flat stretches; relief comes
  // mainly from clustered mountains + craters, not a blanket of bumps.
  const base: BaseStyle = {
    amplitudeFrac: Math.max(0.012, Math.min(0.06, 0.015 + np * 0.07)),
    octaves: Math.max(3, Math.min(7, Math.round(depth) + 1)),
    lacunarity: 2.0,
    persistence: 0.38 + ne * 0.18,
    frequency: 2.0,
    warp: 0.25 + np * 0.5,
  };

  // Asteroids with stronger perturbation get more dramatic relief.
  const mountains: MountainStyle = {
    heightFrac: Math.max(0.05, Math.min(0.28, 0.06 + np * 0.4)),
    frequency: 1.6,
    octaves: 5,
    regions: 3,
  };

  const craterStep = findStep(steps, "mesh:craters");
  const craters: CraterLayerParams | null = craterStep
    ? {
        count: Math.max(0, Math.round(num(craterStep.params.count, 12))),
        minSize: num(craterStep.params.minSize, 0.03),
        maxSize: num(craterStep.params.maxSize, 0.25),
        depthRatio: num(craterStep.params.depthRatio, 0.25),
        rimHeight: num(craterStep.params.rimHeight, 0.06),
        sizeExponent: num(craterStep.params.sizeExponent, 1.8),
      }
    : null;

  // Ridges/fissures inherit the asteroid's fractions, but on a large flat patch
  // those translate to huge "sausage" bulges/trenches — so scale their amplitude
  // and width WAY down for terrain (they should be subtle linear features, not
  // dominant landforms).
  const RIDGE_AMP = 0.18, RIDGE_WIDTH = 0.4;
  const FISSURE_AMP = 0.22, FISSURE_WIDTH = 0.45;

  const ridgeStep = findStep(steps, "mesh:ridges");
  const ridges: LineLayerParams | null = ridgeStep
    ? {
        count: Math.max(0, Math.round(num(ridgeStep.params.count, 4))),
        amount: num(ridgeStep.params.height, 0.08) * RIDGE_AMP,
        width: num(ridgeStep.params.width, 0.06) * RIDGE_WIDTH,
        length: num(ridgeStep.params.length, 0.8),
        jaggedness: num(ridgeStep.params.irregularity, 0.3),
        kind: "ridge",
      }
    : null;

  const fissureStep = findStep(steps, "mesh:fissures");
  const fissures: LineLayerParams | null = fissureStep
    ? {
        count: Math.max(0, Math.round(num(fissureStep.params.count, 5))),
        amount: num(fissureStep.params.depth, 0.03) * FISSURE_AMP,
        width: num(fissureStep.params.width, 0.03) * FISSURE_WIDTH,
        length: num(fissureStep.params.length, 0.5),
        jaggedness: num(fissureStep.params.jaggedness, 0.4),
        kind: "fissure",
      }
    : null;

  // Rocks are always available on terrain (a landed view should show scatter),
  // even if the asteroid pipeline has no mesh:rocks step — fall back to defaults
  // so the Rocks density slider always has an effect.
  const rockStep = findStep(steps, "mesh:rocks");
  const rocks: RockStyle = {
    count: Math.max(1, Math.round(num(rockStep?.params.count, 20))),
    minSize: num(rockStep?.params.minSize, 0.02),
    maxSize: num(rockStep?.params.maxSize, 0.08),
    roughness: num(rockStep?.params.roughness, 0.5),
    detail: num(rockStep?.params.detail, 2),
    templates: Math.max(1, Math.min(8, Math.round(num(rockStep?.params.templates, 5)))),
  };

  return { asteroidSeed, base, mountains, craters, ridges, fissures, rocks };
}
