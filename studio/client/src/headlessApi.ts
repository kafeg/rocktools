/**
 * Headless automation API — exposes store + generate + export on window
 * for Puppeteer-driven GLB generation.
 *
 * Loaded unconditionally in main.tsx; zero cost when not called.
 */
import * as THREE from "three";
import { useStudioStore } from "./stores/useStudioStore";
import { runRocktool, isWasmAvailable } from "./wasm/rockcreateWasm";
import { exportGLBToBuffer, exportRuntimeGLBToBuffer } from "./utils/export";
import { normalizeObj } from "./utils/meshParsing";

async function generate(): Promise<void> {
  const state = useStudioStore.getState();
  const allSteps = state.steps;
  if (allSteps.length === 0) throw new Error("No pipeline steps");

  state.setGenerating(true);
  state.setError(null);

  try {
    const wasmSteps = allSteps.filter((s) => isWasmAvailable(s.tool) && s.enabled !== false);

    const { sourceType, createParams } = state;
    const pipeline = sourceType === "create"
      ? [{ tool: "rockcreate", params: createParams }, ...wasmSteps]
      : wasmSteps;

    let currentObj = "";
    if (state.baseMesh && pipeline[0]?.tool !== "rockcreate") {
      const base = import.meta.env.BASE_URL ?? "/";
      const res = await fetch(`${base}samples/${state.baseMesh}`);
      if (!res.ok) throw new Error(`Failed to load base mesh: ${state.baseMesh}`);
      currentObj = await res.text();
    }

    for (let i = 0; i < pipeline.length; i++) {
      const step = pipeline[i]!;
      const inputObj = i > 0 ? normalizeObj(currentObj) : (currentObj || undefined);
      const result = await runRocktool({ tool: step.tool, params: step.params, inputObj });
      currentObj = result.stdout;
    }

    currentObj = normalizeObj(currentObj);

    // Store raw WASM OBJ — mesh modifiers (craters, boulders, etc.) are applied
    // lazily by getModifiedMeshData() during export/display, preserving featureData.
    useStudioStore.getState().setMeshResult(`headless_${Date.now()}`, currentObj, { nodes: 0, tris: 0, bounds: { x: [0, 0], y: [0, 0], z: [0, 0] } }, "", {});
    useStudioStore.getState().bumpMeshModVersion();
  } catch (err) {
    useStudioStore.getState().setError(err instanceof Error ? err.message : "Generation failed");
    throw err;
  } finally {
    useStudioStore.getState().setGenerating(false);
  }
}

async function exportGLB(resolution: number = 1024): Promise<string> {
  const state = useStudioStore.getState();
  const meshData = state.getModifiedMeshData();
  if (!meshData) throw new Error("No mesh - call generate() first");
  const shaderParams = state.collectShaderParams();

  const glb = await exportGLBToBuffer(meshData, shaderParams, resolution);

  const bytes = new Uint8Array(glb);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function exportRuntimeGLB(): Promise<string> {
  const state = useStudioStore.getState();
  const meshData = state.getModifiedMeshData();
  if (!meshData) throw new Error("No mesh — call generate() first");
  const shaderParams = state.collectShaderParams();

  const glb = await exportRuntimeGLBToBuffer(meshData, shaderParams);

  const bytes = new Uint8Array(glb);
  let binary = "";
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function waitForRendererRefs(timeoutMs: number = 15_000): Promise<{
  gl: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
}> {
  const deadline = performance.now() + timeoutMs;

  while (performance.now() < deadline) {
    const state = useStudioStore.getState();
    const gl = state.rendererRef as THREE.WebGLRenderer | null;
    const scene = state.sceneRef as THREE.Scene | null;
    const camera = state.cameraRef as THREE.Camera | null;

    if (gl && scene && camera) return { gl, scene, camera };

    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  throw new Error("Renderer refs are not initialized");
}

async function exportImage(
  width: number,
  height: number,
  format: "png" | "jpg" = "jpg",
  quality: number = 0.92,
  transparentBg: boolean = false
): Promise<string> {
  const { gl, scene, camera } = await waitForRendererRefs();

  // Adjust camera aspect ratio to match the render target resolution aspect ratio
  let originalAspect: number | undefined;
  const isPerspective = (camera as any).isPerspectiveCamera || camera instanceof THREE.PerspectiveCamera;
  if (isPerspective) {
    const persCam = camera as THREE.PerspectiveCamera;
    originalAspect = persCam.aspect;
    persCam.aspect = width / height;
    persCam.updateProjectionMatrix();
  }

  const rt = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    colorSpace: THREE.SRGBColorSpace,
    samples: 4,
  });
  rt.texture.colorSpace = THREE.SRGBColorSpace;

  const prevRt = gl.getRenderTarget();
  gl.setRenderTarget(rt);
  gl.render(scene, camera);

  const buffer = new Uint8Array(width * height * 4);
  gl.readRenderTargetPixels(rt, 0, 0, width, height, buffer);

  gl.setRenderTarget(prevRt);
  rt.dispose();

  // Restore camera aspect ratio
  if (isPerspective && originalAspect !== undefined) {
    const persCam = camera as THREE.PerspectiveCamera;
    persCam.aspect = originalAspect;
    persCam.updateProjectionMatrix();
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const srcIdx = ((height - 1 - y) * width + x) * 4;
      const dstIdx = (y * width + x) * 4;
      imageData.data[dstIdx] = buffer[srcIdx]!;
      imageData.data[dstIdx + 1] = buffer[srcIdx + 1]!;
      imageData.data[dstIdx + 2] = buffer[srcIdx + 2]!;
      imageData.data[dstIdx + 3] = transparentBg ? buffer[srcIdx + 3]! : 255;
    }
  }

  ctx.putImageData(imageData, 0, 0);

  const mimeType = format === "jpg" ? "image/jpeg" : "image/png";
  const dataUrl = canvas.toDataURL(mimeType, format === "jpg" ? quality : undefined);
  return dataUrl.split(",")[1]!;
}

export function installHeadlessApi() {
  (window as any).__rocktools = {
    store: useStudioStore,

    importConfig(config: { sourceType: string; baseMesh: string; createParams: Record<string, any>; steps: Array<{ tool: string; params: Record<string, any>; enabled?: boolean }> }) {
      useStudioStore.getState().importPipelineConfig(config);
    },

    generate,

    async exportGLB(resolution: number = 1024): Promise<string> {
      return exportGLB(resolution);
    },

    async exportRuntimeGLB(): Promise<string> {
      return exportRuntimeGLB();
    },

    async exportImage(
      width: number,
      height: number,
      format: "png" | "jpg" = "jpg",
      quality: number = 0.92,
      transparentBg: boolean = false
    ): Promise<string> {
      return exportImage(width, height, format, quality, transparentBg);
    },

    exportMaterialAsset() {
      return {
        shaderFamily: "asteroid-material",
        shaderVersion: "v1",
        material: useStudioStore.getState().collectShaderParams(),
      };
    },

    isGenerating(): boolean {
      return useStudioStore.getState().isGenerating;
    },

    hasMesh(): boolean {
      const obj = useStudioStore.getState().currentMeshObj;
      return !!obj && obj.length > 100;
    },
  };
}
