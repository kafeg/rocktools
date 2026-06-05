import { describe, it, expect } from "vitest";
import { deriveSeed } from "../client/src/utils/prng";
import { validateMesh } from "../client/src/utils/meshModifiers";
import {
  generateTerrain,
  buildTerrainMesh,
  createField,
  applyBaseFbm,
  type TerrainParams,
} from "../client/src/utils/terrain";
import type { TerrainStyle } from "../client/src/utils/terrain";

const STYLE: TerrainStyle = {
  asteroidSeed: 12345,
  base: { amplitudeFrac: 0.05, octaves: 4, lacunarity: 2, persistence: 0.5, frequency: 2.5, warp: 0.3 },
  mountains: { heightFrac: 0.1, frequency: 1.6, octaves: 5, regions: 3 },
  craters: { count: 10, minSize: 0.03, maxSize: 0.25, depthRatio: 0.25, rimHeight: 0.06, sizeExponent: 1.8 },
  ridges: { count: 3, amount: 0.08, width: 0.06, length: 0.8, jaggedness: 0.3, kind: "ridge" },
  fissures: { count: 3, amount: 0.03, width: 0.03, length: 0.5, jaggedness: 0.4, kind: "fissure" },
  rocks: { count: 20, minSize: 0.02, maxSize: 0.08, roughness: 0.5, detail: 2, templates: 4 },
};

const PARAMS: TerrainParams = {
  // Use the reference tile size so feature counts (which scale with area) are
  // present; a sub-reference footprint intentionally yields very few features.
  footprint: 20,
  resolution: 48,
  craterDensity: 1,
  rockDensity: 2,
  detailBoost: 1,
  mountainAmount: 1,
  mountainScale: 1,
  mountainCoverage: 0.5,
  foldSharpness: 0.6,
  fissureDensity: 1,
  ridgeDensity: 1,
  erosion: 0.4,
};

function arraysEqual(a: Float64Array, b: Float64Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

describe("deriveSeed", () => {
  it("is deterministic", () => {
    expect(deriveSeed(1, 2, 3)).toBe(deriveSeed(1, 2, 3));
  });

  it("is sensitive to every input (asteroidSeed fixed, surfaceSeed varies)", () => {
    const a = deriveSeed(100, 1, 0);
    const b = deriveSeed(100, 2, 0); // only surfaceSeed changes
    const c = deriveSeed(101, 1, 0); // only asteroidSeed changes
    const d = deriveSeed(100, 1, 1); // only layer changes
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });

  it("returns a uint32", () => {
    const v = deriveSeed(0, 0, 0);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(v)).toBe(true);
  });
});

describe("terrain generation determinism", () => {
  it("same (style, params, surfaceSeed) → identical mesh", () => {
    const a = generateTerrain(STYLE, PARAMS, 7);
    const b = generateTerrain(STYLE, PARAMS, 7);
    expect(arraysEqual(a.mesh.positions, b.mesh.positions)).toBe(true);
    expect(a.scatter.instances.length).toBe(b.scatter.instances.length);
  });

  it("different surfaceSeed → different terrain (asteroid untouched)", () => {
    const a = generateTerrain(STYLE, PARAMS, 7);
    const b = generateTerrain(STYLE, PARAMS, 8);
    expect(arraysEqual(a.mesh.positions, b.mesh.positions)).toBe(false);
  });

  it("different asteroidSeed → different terrain at same surfaceSeed", () => {
    const a = generateTerrain(STYLE, PARAMS, 7);
    const b = generateTerrain({ ...STYLE, asteroidSeed: 999 }, PARAMS, 7);
    expect(arraysEqual(a.mesh.positions, b.mesh.positions)).toBe(false);
  });

  it("feature density overrides change output deterministically (fissures off)", () => {
    const on = generateTerrain(STYLE, { ...PARAMS, fissureDensity: 1 }, 7);
    const off = generateTerrain(STYLE, { ...PARAMS, fissureDensity: 0 }, 7);
    expect(arraysEqual(on.mesh.positions, off.mesh.positions)).toBe(false);
    const off2 = generateTerrain(STYLE, { ...PARAMS, fissureDensity: 0 }, 7);
    expect(arraysEqual(off.mesh.positions, off2.mesh.positions)).toBe(true);
  });

  it("produces a non-degenerate, finite heightfield", () => {
    const { mesh } = generateTerrain(STYLE, PARAMS, 7);
    expect(mesh.vertexCount).toBe(PARAMS.resolution * PARAMS.resolution);
    for (let i = 0; i < mesh.positions.length; i++) {
      expect(Number.isFinite(mesh.positions[i]!)).toBe(true);
    }
  });
});

describe("terrain metadata", () => {
  it("is produced deterministically with sane landing pads", () => {
    const a = generateTerrain(STYLE, PARAMS, 7);
    const b = generateTerrain(STYLE, PARAMS, 7);
    expect(a.meta.surfaceSeed).toBe(7);
    expect(a.meta.asteroidSeed).toBe(STYLE.asteroidSeed);
    expect(a.meta.footprint).toBe(PARAMS.footprint);
    expect(JSON.stringify(a.meta)).toBe(JSON.stringify(b.meta));
    expect(a.meta.stats.flatFraction).toBeGreaterThanOrEqual(0);
    expect(a.meta.stats.flatFraction).toBeLessThanOrEqual(1);
    // Landing pads sit inside the footprint and are sorted flattest-first.
    for (const pad of a.meta.landingPads) {
      expect(Math.abs(pad.x)).toBeLessThanOrEqual(PARAMS.footprint / 2);
      expect(Math.abs(pad.z)).toBeLessThanOrEqual(PARAMS.footprint / 2);
    }
    for (let i = 1; i < a.meta.landingPads.length; i++) {
      expect(a.meta.landingPads[i]!.slope).toBeGreaterThanOrEqual(a.meta.landingPads[i - 1]!.slope);
    }
  });
});

describe("terrain validation (open mesh)", () => {
  it("a flat heightfield passes open validation but fails closed validation", () => {
    const field = createField(32, 4);
    applyBaseFbm(field, { amplitude: 0.1, octaves: 3, lacunarity: 2, persistence: 0.5, frequency: 2, warp: 0 }, 1);
    const mesh = buildTerrainMesh(field);

    // Open mode (terrain): valid — boundary/volume heuristics skipped.
    expect(validateMesh(mesh, { open: true }).valid).toBe(true);

    // Closed mode (asteroid default): a flat plate is all-boundary → invalid.
    // This is exactly the false "self-intersecting"/"not closed" case we avoid.
    expect(validateMesh(mesh).valid).toBe(false);
  });

  it("a full terrain with scattered-rock style still validates as open", () => {
    const { mesh } = generateTerrain(STYLE, PARAMS, 3);
    expect(validateMesh(mesh, { open: true }).valid).toBe(true);
  });
});
