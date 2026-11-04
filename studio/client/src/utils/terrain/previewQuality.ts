/**
 * Interactive-preview quality caps for the Surface tab.
 *
 * The EXPORTER writes what the game ships: the full `params.resolution` grid and
 * the full-detail rock templates. The on-screen preview does not need that, and
 * paying for it made the Surface tab unusable. Measured on an M2 Pro at
 * 1600x900, dpr 1, Ryugu's pipeline at the shipped defaults (1280² grid,
 * 2907 rocks) — 4.20 M triangles in 9 draw calls:
 *
 *   steady state   83.6 ms/frame (11.8 fps); 119 ms on a Retina canvas
 *   generation     one 310 ms frame AFTER the worker returns (1.2 s under load)
 *
 * Both have the same root cause — triangle count, not pixels:
 *
 *   - A CDP CPU profile of the steady state shows the main thread IDLE for
 *     6055 of 6218 ms: the frame is pure GPU. Swapping the ground to a flat
 *     MeshStandardMaterial — same geometry, same screen coverage — cut the frame
 *     from 83.6 ms to 16.7 ms, and swapping the rocks too cut it to 8.3 ms. So
 *     67 ms of that frame is the ground's shader, 8 ms the rocks' and 8 ms all
 *     the vertex work: 3.27 M sub-pixel triangles each force a 2x2 fragment quad
 *     through an 18-tap triplanar + hex-detiled shader, running it roughly 10x
 *     per covered pixel. Cut the grid to 512² and the ground's share falls to
 *     17 ms — it tracks the triangle count, not the area on screen.
 *   - The generation freeze is the main-thread handover of the same geometry,
 *     and the profile adds up to the whole 310 ms frame: bufferData 191 ms
 *     (position 20 MB + normal 20 MB + featureData 2x26 MB + index 39 MB =
 *     131 MB uploaded in one go), validateMesh 76 ms, the Float64 -> Float32
 *     copy in meshDataToGeometry 29 ms, meshInfoFromMeshData 11 ms, THREE's
 *     computeBoundingSphere ~9 ms.
 *
 * So the preview draws a coarser grid and coarser rock templates. Coarsening a
 * template does not move a rock: scatterRocks takes its placement randoms from a
 * stream that does not depend on the subdivision, so every rock keeps its spot
 * and its size and only loses facets. The coarser GRID does shift the scatter by
 * a hair — the slope and clustering rejections sample the field, and a few
 * borderline candidates fall the other way (2902 preview rocks against 2907 for
 * the same seed), which is invisible and never reaches the export.
 */

import type { TerrainParams } from "./generateTerrain";
import type { TerrainStyle } from "./terrainStyle";

export interface TerrainPreviewQuality {
  /** Grid resolution ceiling for the preview (vertices per side). */
  resolution: number;
  /** Rock-template subdivision ceiling (1..3); placement is unaffected. */
  rockDetail: number;
}

/**
 * Chosen by measurement, same rig and scene, 5 s of frames per cell. The budget
 * is 33 ms/frame = 30 fps; `rockDetail` 2 is the authored template (320 tri),
 * 1 is one subdivision less (80 tri) at identical placement:
 *
 *   grid            dpr 1                  dpr 2 (Retina)
 *   1280² d2   11.2 fps  88.1 ms      ~7.7 fps ~130 ms   <- the shipped default
 *    768² d2   17.2 fps  59.6 ms
 *    640² d2   21.3 fps  47.5 ms
 *    512² d2   27.0 fps  36.7 ms
 *    512² d1   31.6 fps  32.7 ms      22.2 fps  45.3 ms
 *    384² d1   42.1 fps  24.8 ms      27.7 fps  35.1 ms
 *    256² d1   62.0 fps  16.6 ms      35.6 fps  26.6 ms  <- shipped cap
 *
 * The dpr-2 column is the one that matters: it reproduces the frame the
 * maintainer measured (119 ms, 8.4 fps) on the shipped default, so that is the
 * configuration the cap has to clear 30 fps on — and only 256² does.
 *
 * The grid is the lever that has to move: at 512² the GROUND alone already costs
 * 42 ms at dpr 2 (measured with the scatter switched off — 22.5 fps), so no
 * amount of rock trimming reaches 30 fps there. The scatter is worth coarsening
 * anyway, because once the grid is capped it carries the larger half of the
 * preview's triangles (233 k against 130 k) for 8 ms of shader at dpr 1 and
 * about twice that on Retina. One subdivision lower still (a 20-triangle
 * template) was measured too and rejected: it buys around 12 ms at dpr 2 but
 * visibly flattens the boulders into chips, which is the one thing a terrain
 * preview exists to show.
 *
 * 256² still draws 130 k ground triangles for a patch that covers roughly
 * 800 x 800 screen pixels — about one triangle per 5 px² — so regional relief,
 * mountains, scarps, terraces and all but the smallest craters still read. What
 * the preview no longer resolves is sub-decimetre detail on a 40 m footprint
 * (one grid cell is 16 cm at 256² against 3 cm at 1280²). Raise `resolution`
 * here to trade the frame rate back for that detail; the export never changes.
 */
export const DEFAULT_TERRAIN_PREVIEW_QUALITY: TerrainPreviewQuality = {
  resolution: 256,
  rockDetail: 1,
};

let quality: TerrainPreviewQuality | null = { ...DEFAULT_TERRAIN_PREVIEW_QUALITY };

/** `null` renders the preview at full export quality (used for CLI thumbnails). */
export function setTerrainPreviewQuality(q: Partial<TerrainPreviewQuality> | null): void {
  quality = q === null ? null : { ...DEFAULT_TERRAIN_PREVIEW_QUALITY, ...quality, ...q };
}

export function getTerrainPreviewQuality(): TerrainPreviewQuality | null {
  return quality;
}

/** The grid resolution the preview will actually use for these params. */
export function previewResolution(resolution: number): number {
  return quality ? Math.min(resolution, quality.resolution) : resolution;
}

export function previewTerrainParams(params: TerrainParams): TerrainParams {
  const resolution = previewResolution(params.resolution);
  return resolution === params.resolution ? params : { ...params, resolution };
}

export function previewTerrainStyle(style: TerrainStyle): TerrainStyle {
  if (!quality) return style;
  const detail = Math.min(style.rocks.detail, quality.rockDetail);
  return detail === style.rocks.detail
    ? style
    : { ...style, rocks: { ...style.rocks, detail } };
}
