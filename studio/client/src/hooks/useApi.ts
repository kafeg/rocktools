import { useCallback, useRef, type MutableRefObject } from "react";
import { useStudioStore } from "../stores/useStudioStore";
import type { MeshInfo, PipelineStep } from "../types";
import type { WorkerInMessage, WorkerOutMessage } from "../wasm/pipelineTypes";
import { runRocktool } from "../wasm/rockcreateWasm";
import { normalizeObj, parseMeshInfoFromObj } from "../utils/meshParsing";

// ── Main-thread fallback ────────────────────────────────────────────

async function generateOnMainThread(
  pipelineSteps: PipelineStep[],
  baseMesh?: string,
): Promise<{ meshObj: string; info: MeshInfo; durationMs: number; stderr: string; cliArgs: Record<string, string[]> }> {
  const startTime = performance.now();
  let currentObj = "";
  const cliArgs: Record<string, string[]> = {};
  const stderrParts: string[] = [];

  if (baseMesh && pipelineSteps[0]?.tool !== "rockcreate") {
    const base = import.meta.env.BASE_URL ?? "/";
    const res = await fetch(`${base}samples/${baseMesh}`);
    if (!res.ok) throw new Error(`Failed to load base mesh: ${baseMesh}`);
    currentObj = await res.text();
  }

  for (let i = 0; i < pipelineSteps.length; i++) {
    const step = pipelineSteps[i]!;

    useStudioStore.getState().setGenerationProgress({
      step: i + 1,
      total: pipelineSteps.length,
      tool: step.tool,
    });

    const inputObj = i > 0 ? normalizeObj(currentObj) : (currentObj || undefined);
    const result = await runRocktool({
      tool: step.tool,
      params: step.params,
      inputObj,
    });
    currentObj = result.stdout;
    cliArgs[step.tool] = result.args;
    if (result.stderr) stderrParts.push(result.stderr);
  }

  currentObj = normalizeObj(currentObj);
  const info = parseMeshInfoFromObj(currentObj);
  const durationMs = Math.round(performance.now() - startTime);

  return { meshObj: currentObj, info, durationMs, stderr: stderrParts.join("\n"), cliArgs };
}

// ── Worker management ───────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 120_000;

function createPipelineWorker(): Worker | null {
  try {
    return new Worker(
      new URL("../wasm/pipeline.worker.ts", import.meta.url),
      { type: "module" },
    );
  } catch {
    return null;
  }
}

// ── Hook ────────────────────────────────────────────────────────────

export function useApi() {
  const workerRef = useRef<Worker | null>(null);
  const workerFailedRef = useRef(false);

  const abort = useCallback(() => {
    const worker = workerRef.current;
    if (worker) {
      worker.terminate();
      workerRef.current = null;
    }
    const state = useStudioStore.getState();
    if (state.isGenerating) {
      state.setGenerating(false);
      state.setGenerationProgress(null);
      state.setAbortGeneration(null);
      state.setError("Generation cancelled");
    }
  }, []);

  const generate = useCallback(async () => {
    const state = useStudioStore.getState();
    if (state.isGenerating) return;

    const pipelineSteps = state.getPipelineSteps();

    if (pipelineSteps.length === 0) {
      state.setError("Add at least one pipeline step");
      return;
    }

    state.setGenerating(true);
    state.setError(null);
    state.setGenerationProgress(null);
    state.setAbortGeneration(abort);

    if (!workerFailedRef.current) {
      try {
        await generateViaWorker(pipelineSteps, state.baseMesh, workerRef, workerFailedRef, abort);
        return;
      } catch (e) {
        if (workerFailedRef.current) {
          console.warn("Worker unavailable, falling back to main thread:", e);
        } else {
          useStudioStore.getState().setError(e instanceof Error ? e.message : "Generation failed");
          useStudioStore.getState().setGenerating(false);
          useStudioStore.getState().setGenerationProgress(null);
          useStudioStore.getState().setAbortGeneration(null);
          return;
        }
      }
    }

    try {
      const { meshObj, info, durationMs, stderr, cliArgs } = await generateOnMainThread(
        pipelineSteps,
        state.baseMesh,
      );
      handleResult(meshObj, info, durationMs, stderr, cliArgs);
    } catch (err) {
      useStudioStore.getState().setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      useStudioStore.getState().setGenerating(false);
      useStudioStore.getState().setGenerationProgress(null);
      useStudioStore.getState().setAbortGeneration(null);
    }
  }, [abort]);

  return { generate, abort };
}

// ── Worker execution ────────────────────────────────────────────────

function generateViaWorker(
  pipelineSteps: PipelineStep[],
  baseMesh: string,
  workerRef: MutableRefObject<Worker | null>,
  workerFailedRef: MutableRefObject<boolean>,
  abort: () => void,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let worker = workerRef.current;
    if (!worker) {
      worker = createPipelineWorker();
      if (!worker) {
        workerFailedRef.current = true;
        reject(new Error("Worker creation failed"));
        return;
      }
      workerRef.current = worker;
    }

    const timeoutId = setTimeout(() => {
      abort();
      reject(new Error("Generation timed out"));
    }, DEFAULT_TIMEOUT_MS);

    worker.onmessage = (event: MessageEvent<WorkerOutMessage>) => {
      const msg = event.data;

      switch (msg.type) {
        case "progress":
          useStudioStore.getState().setGenerationProgress({
            step: msg.step,
            total: msg.total,
            tool: msg.tool,
          });
          break;

        case "result":
          clearTimeout(timeoutId);
          handleResult(msg.meshObj, msg.info, msg.durationMs, msg.stderr, msg.cliArgs);
          useStudioStore.getState().setGenerating(false);
          useStudioStore.getState().setGenerationProgress(null);
          useStudioStore.getState().setAbortGeneration(null);
          resolve();
          break;

        case "error":
          clearTimeout(timeoutId);
          reject(new Error(msg.message));
          break;
      }
    };

    worker.onerror = (event: ErrorEvent) => {
      clearTimeout(timeoutId);
      worker!.terminate();
      workerRef.current = null;
      workerFailedRef.current = true;
      reject(new Error(event.message || "Worker error"));
    };

    const baseUrl = import.meta.env.BASE_URL ?? "/";
    const message: WorkerInMessage = {
      type: "generate",
      steps: pipelineSteps,
      baseMesh: baseMesh || undefined,
      baseUrl,
    };
    worker.postMessage(message);
  });
}

// ── Shared result handler ───────────────────────────────────────────

function handleResult(
  meshObj: string,
  info: MeshInfo,
  durationMs: number,
  stderr: string,
  cliArgs: Record<string, string[]>,
) {
  const resultId = `wasm_${Date.now()}`;
  const state = useStudioStore.getState();

  state.setMeshResult(resultId, meshObj, info, stderr, cliArgs);
  state.bumpMeshModVersion();

  const allSteps = state.sourceType === "create"
    ? [{ id: "source_create", tool: "rockcreate", params: { ...state.createParams } }, ...state.steps]
    : [...state.steps];

  state.addJournalEntry({
    id: resultId,
    name: `Generation ${new Date().toLocaleTimeString()}`,
    meshId: resultId,
    info,
    steps: allSteps,
    baseMesh: state.baseMesh,
    timestamp: Date.now(),
    durationMs,
  });
}
