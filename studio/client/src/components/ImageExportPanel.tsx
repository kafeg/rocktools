import { useState } from "react";
import * as THREE from "three";
import { useStudioStore, IMAGE_RESOLUTION_PRESETS, type ImageFormat } from "../stores/useStudioStore";

export default function ImageExportPanel() {
  const bgMode = useStudioStore((s) => s.background.mode);
  const [width, setWidth] = useState(1920);
  const [height, setHeight] = useState(1080);
  const [format, setFormat] = useState<ImageFormat>("png");
  const [jpegQuality, setJpegQuality] = useState(92);
  const [isCapturing, setIsCapturing] = useState(false);
  const [presetLabel, setPresetLabel] = useState("1080p");

  function selectPreset(label: string, w: number, h: number) {
    setWidth(w);
    setHeight(h);
    setPresetLabel(label);
  }

  async function handleCapture() {
    const { rendererRef, sceneRef, cameraRef } = useStudioStore.getState();
    if (!rendererRef || !sceneRef || !cameraRef) return;
    const gl = rendererRef as THREE.WebGLRenderer;
    const scene = sceneRef as THREE.Scene;
    const camera = cameraRef as THREE.Camera;

    setIsCapturing(true);
    try {
      await captureImage(gl, scene, camera, width, height, format, jpegQuality / 100, bgMode === "transparent");
    } finally {
      setIsCapturing(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {IMAGE_RESOLUTION_PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => selectPreset(p.label, p.width, p.height)}
            className={`flex-1 py-1 text-[10px] uppercase tracking-wider rounded transition-colors ${
              presetLabel === p.label
                ? "bg-space-accent/20 text-space-accent"
                : "text-space-dim/60 hover:text-space-dim"
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          onClick={() => setPresetLabel("custom")}
          className={`flex-1 py-1 text-[10px] uppercase tracking-wider rounded transition-colors ${
            presetLabel === "custom"
              ? "bg-space-accent/20 text-space-accent"
              : "text-space-dim/60 hover:text-space-dim"
          }`}
        >
          Custom
        </button>
      </div>

      {presetLabel === "custom" && (
        <div className="flex items-center gap-2 text-xs">
          <input type="number" value={width} min={100} max={7680}
            onChange={(e) => setWidth(parseInt(e.target.value) || 1920)}
            className="w-16 bg-space-bg border border-space-border rounded px-1.5 py-0.5 text-space-text text-xs" />
          <span className="text-space-dim/50">x</span>
          <input type="number" value={height} min={100} max={4320}
            onChange={(e) => setHeight(parseInt(e.target.value) || 1080)}
            className="w-16 bg-space-bg border border-space-border rounded px-1.5 py-0.5 text-space-text text-xs" />
        </div>
      )}

      <div className="flex items-center gap-2 text-xs">
        <span className="text-space-dim w-12 shrink-0">Format</span>
        <div className="flex gap-1">
          {(["png", "jpg"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFormat(f)}
              className={`px-2 py-0.5 rounded text-[10px] uppercase transition-colors ${
                format === f
                  ? "bg-space-accent/20 text-space-accent"
                  : "text-space-dim/60 hover:text-space-dim"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        {bgMode === "transparent" && format === "png" && (
          <span className="text-[10px] text-space-accent/60">+ alpha</span>
        )}
      </div>

      {format === "jpg" && (
        <div className="flex items-center gap-2 text-xs">
          <span className="w-12 text-space-dim shrink-0">Quality</span>
          <input type="range" min={60} max={100} step={1} value={jpegQuality}
            onChange={(e) => setJpegQuality(parseInt(e.target.value))}
            className="flex-1 h-1 accent-space-accent" />
          <span className="w-8 text-right text-space-dim/50 font-mono text-[10px]">{jpegQuality}%</span>
        </div>
      )}

      <button
        onClick={handleCapture}
        disabled={isCapturing}
        className="w-full py-1.5 rounded text-xs font-medium transition-colors bg-space-warm/20 text-space-warm hover:bg-space-warm/30 disabled:opacity-50"
      >
        {isCapturing ? "Capturing..." : `Capture ${width}x${height}`}
      </button>
    </div>
  );
}

async function captureImage(
  gl: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
  format: ImageFormat,
  quality: number,
  transparentBg: boolean,
): Promise<void> {
  const rt = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    colorSpace: THREE.SRGBColorSpace, // Enforce sRGB color space rendering to prevent dark images
    samples: 4,
  });
  rt.texture.colorSpace = THREE.SRGBColorSpace;

  const prevRt = gl.getRenderTarget();

  // Adjust camera aspect ratio to match the render target resolution aspect ratio
  let originalAspect: number | undefined;
  const isPerspective = (camera as any).isPerspectiveCamera || camera instanceof THREE.PerspectiveCamera;
  if (isPerspective) {
    const persCam = camera as THREE.PerspectiveCamera;
    originalAspect = persCam.aspect;
    persCam.aspect = width / height;
    persCam.updateProjectionMatrix();
  }

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

  const link = document.createElement("a");
  link.download = `asteroid_${width}x${height}.${format}`;
  link.href = dataUrl;
  link.click();
}
