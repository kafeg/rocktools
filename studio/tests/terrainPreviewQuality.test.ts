import { describe, it, expect, afterEach } from "vitest";
import {
  DEFAULT_TERRAIN_PREVIEW_QUALITY,
  previewResolution,
  previewTerrainParams,
  previewTerrainStyle,
  setTerrainPreviewQuality,
  type TerrainParams,
  type TerrainStyle,
} from "../client/src/utils/terrain";
import { generateTerrainAsync } from "../client/src/workers/terrainClient";

const STYLE: TerrainStyle = {
  asteroidSeed: 4242,
  base: { amplitudeFrac: 0.05, octaves: 3, lacunarity: 2, persistence: 0.5, frequency: 2.5, warp: 0.3 },
  mountains: null,
  craters: { count: 6, minSize: 0.03, maxSize: 0.25, depthRatio: 0.25, rimHeight: 0.06, sizeExponent: 1.8 },
  ridges: null,
  fissures: null,
  rocks: { count: 4, minSize: 0.02, maxSize: 0.08, roughness: 0.5, detail: 2, templates: 2 },
};

const PARAMS: TerrainParams = {
  footprint: 20,
  resolution: 192,
  craterDensity: 1,
  rockDensity: 1,
  detailBoost: 1,
  mountainAmount: 0,
  mountainScale: 1,
  mountainCoverage: 0.4,
  foldSharpness: 0.5,
  fissureDensity: 0,
  ridgeDensity: 0,
  erosion: 0,
};

afterEach(() => setTerrainPreviewQuality({ ...DEFAULT_TERRAIN_PREVIEW_QUALITY }));

describe("terrain preview quality", () => {
  it("caps the grid and the rock templates, and leaves a coarse grid alone", () => {
    setTerrainPreviewQuality({ resolution: 64, rockDetail: 1 });
    expect(previewResolution(1280)).toBe(64);
    expect(previewResolution(48)).toBe(48);
    expect(previewTerrainParams({ ...PARAMS, resolution: 1280 }).resolution).toBe(64);
    expect(previewTerrainStyle(STYLE).rocks.detail).toBe(1);
  });

  it("never mutates the caller's params or style", () => {
    setTerrainPreviewQuality({ resolution: 64, rockDetail: 1 });
    const params = { ...PARAMS, resolution: 1280 };
    const style = { ...STYLE, rocks: { ...STYLE.rocks } };
    previewTerrainParams(params);
    previewTerrainStyle(style);
    expect(params.resolution).toBe(1280);
    expect(style.rocks.detail).toBe(2);
  });

  it("renders the preview capped but exports at the authored resolution", async () => {
    setTerrainPreviewQuality({ resolution: 64, rockDetail: 1 });
    const preview = await generateTerrainAsync(STYLE, PARAMS, 7);
    const exported = await generateTerrainAsync(STYLE, PARAMS, 7, { quality: "export" });

    expect(preview.mesh.vertexCount).toBe(64 * 64);
    expect(exported.mesh.vertexCount).toBe(PARAMS.resolution ** 2);
    expect(exported.mesh.triCount).toBe(2 * (PARAMS.resolution - 1) ** 2);
    // The export keeps the authored template detail; the preview drops one level.
    expect(exported.scatter.templates[0]!.triCount).toBeGreaterThan(
      preview.scatter.templates[0]!.triCount,
    );
  });

  it("lifts every cap when the quality is null", async () => {
    setTerrainPreviewQuality(null);
    const full = await generateTerrainAsync(STYLE, PARAMS, 7);
    const exported = await generateTerrainAsync(STYLE, PARAMS, 7, { quality: "export" });
    expect(full.mesh.vertexCount).toBe(PARAMS.resolution ** 2);
    expect(full.scatter.templates[0]!.triCount).toBe(exported.scatter.templates[0]!.triCount);
  });
});
