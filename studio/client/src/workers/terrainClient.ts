/**
 * Main-thread client for the terrain Web Worker.
 *
 * Manages a singleton worker and correlates requests by id. Falls back to
 * synchronous generation if Workers are unavailable (e.g. headless/test env).
 */
import {
  generateTerrain as runSync,
  type TerrainParams,
  type TerrainStyle,
  type TerrainResult,
} from "../utils/terrain";

export type TerrainPayload = Pick<TerrainResult, "mesh" | "scatter" | "meta">;

interface Pending {
  resolve: (v: TerrainPayload) => void;
  reject: (e: Error) => void;
}

let worker: Worker | null = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map<number, Pending>();

function getWorker(): Worker | null {
  if (workerBroken) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./terrainWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent) => {
      const { id, error, mesh, scatter, meta } = e.data;
      const p = pending.get(id);
      if (!p) return;
      pending.delete(id);
      if (error) p.reject(new Error(error));
      else p.resolve({ mesh, scatter, meta });
    };
    worker.onerror = () => {
      workerBroken = true;
      worker = null;
      for (const p of pending.values()) p.reject(new Error("terrain worker crashed"));
      pending.clear();
    };
  } catch {
    workerBroken = true;
    worker = null;
  }
  return worker;
}

export function generateTerrainAsync(
  style: TerrainStyle,
  params: TerrainParams,
  surfaceSeed: number,
): Promise<TerrainPayload> {
  const w = getWorker();
  if (!w) {
    // Synchronous fallback (blocks, but keeps things working without a worker).
    try {
      const { mesh, scatter, meta } = runSync(style, params, surfaceSeed);
      return Promise.resolve({ mesh, scatter, meta });
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error(String(e)));
    }
  }
  return new Promise<TerrainPayload>((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    w.postMessage({ id, style, params, surfaceSeed });
  });
}
