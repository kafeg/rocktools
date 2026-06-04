/**
 * Terrain generation Web Worker.
 *
 * The terrain core is pure TS (no DOM/Three), so it runs cleanly off the main
 * thread. This keeps the UI responsive (and the "Generating terrain…" overlay
 * animating) during the heavy 768² heightfield pass. Result buffers are
 * transferred (not copied) back to the main thread.
 */
import { generateTerrain, type TerrainParams, type TerrainStyle } from "../utils/terrain";
import type { MeshData } from "../utils/meshModifiers";

interface Req {
  id: number;
  style: TerrainStyle;
  params: TerrainParams;
  surfaceSeed: number;
}

function collect(mesh: MeshData, into: ArrayBuffer[]): void {
  into.push(
    mesh.positions.buffer as ArrayBuffer,
    mesh.normals.buffer as ArrayBuffer,
    mesh.indices.buffer as ArrayBuffer,
  );
  if (mesh.featureData) into.push(mesh.featureData.buffer as ArrayBuffer);
  if (mesh.featureData2) into.push(mesh.featureData2.buffer as ArrayBuffer);
}

(self as unknown as Worker).onmessage = (e: MessageEvent<Req>) => {
  const { id, style, params, surfaceSeed } = e.data;
  try {
    const { mesh, scatter, meta } = generateTerrain(style, params, surfaceSeed);
    const transfer: ArrayBuffer[] = [];
    collect(mesh, transfer);
    for (const t of scatter.templates) collect(t, transfer);
    (self as unknown as Worker).postMessage({ id, mesh, scatter, meta }, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String(err) });
  }
};
