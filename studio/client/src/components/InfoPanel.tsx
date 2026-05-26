import { useRef, useState, useCallback } from "react";
import { useStudioStore } from "../stores/useStudioStore";
import { exportGLB, exportPipelineParams, parsePipelineConfig, encodeShareUrl, recommendTextureResolution } from "../utils/export";
import Tooltip from "./Tooltip";

export default function InfoPanel() {
  const info = useStudioStore((s) => s.currentInfo);
  const error = useStudioStore((s) => s.error);
  const lastStderr = useStudioStore((s) => s.lastStderr);
  const lastCliArgs = useStudioStore((s) => s.lastCliArgs);
  const currentMeshObj = useStudioStore((s) => s.currentMeshObj);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const showStatus = useCallback((msg: string) => {
    setExportStatus(msg);
    setTimeout(() => setExportStatus(null), 2500);
  }, []);

  async function handleExportGLB(resolution: number | "auto") {
    if (!currentMeshObj) return;
    setIsExporting(true);
    try {
      const meshData = useStudioStore.getState().getModifiedMeshData();
      if (!meshData) return;
      const params = useStudioStore.getState().collectShaderParams();
      const res = resolution === "auto"
        ? recommendTextureResolution(info?.tris ?? 1000)
        : resolution;
      await exportGLB(meshData, params, res);
      showStatus(`GLB ${res}px exported`);
    } catch (e) {
      useStudioStore.getState().setError(`Export failed: ${e}`);
    } finally {
      setIsExporting(false);
    }
  }

  function handleExportParams() {
    const config = useStudioStore.getState().exportPipelineConfig();
    exportPipelineParams(config);
    showStatus("Params saved");
  }

  async function handleShare() {
    const config = useStudioStore.getState().exportPipelineConfig();
    const url = encodeShareUrl(config);
    try {
      await navigator.clipboard.writeText(url);
      showStatus("Link copied!");
    } catch {
      window.prompt("Copy this link:", url);
    }
  }

  function handleImportParams(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const config = parsePipelineConfig(reader.result as string);
      if (config) {
        useStudioStore.getState().importPipelineConfig(config);
      } else {
        useStudioStore.getState().setError("Invalid pipeline config file");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  const autoRes = info ? recommendTextureResolution(info.tris) : null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto">
        <div className="flex flex-col gap-3 p-3">
          {/* Mesh info */}
          {info && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-space-dim mb-2">Mesh Info</div>
              <div className="space-y-1 text-[11px] font-mono">
                <div className="flex justify-between">
                  <span className="text-space-dim">Vertices</span>
                  <span>{info.nodes.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-space-dim">Triangles</span>
                  <span>{info.tris.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-space-dim">Size X</span>
                  <span>{(info.bounds.x[1] - info.bounds.x[0]).toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-space-dim">Size Y</span>
                  <span>{(info.bounds.y[1] - info.bounds.y[0]).toFixed(3)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-space-dim">Size Z</span>
                  <span>{(info.bounds.z[1] - info.bounds.z[0]).toFixed(3)}</span>
                </div>
              </div>
            </div>
          )}

          {/* CLI Arguments */}
          {Object.keys(lastCliArgs).length > 0 && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-space-dim mb-2">CLI Arguments</div>
              <div className="space-y-1.5">
                {Object.entries(lastCliArgs).map(([tool, args]) => (
                  <div key={tool}>
                    <div className="text-[10px] text-space-accent font-medium mb-0.5">{tool}</div>
                    <code className="block text-[10px] font-mono text-space-text bg-space-bg rounded px-1.5 py-1
                                     break-all leading-relaxed">
                      {args.join(" ")}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-space-danger mb-2">Error</div>
              <pre className="text-[10px] font-mono text-space-danger bg-space-danger/10 border border-space-danger/30
                              rounded p-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-all">
                {error}
              </pre>
            </div>
          )}

          {/* Tool output */}
          {lastStderr && (
            <div>
              <div className="text-[10px] uppercase tracking-wider text-space-dim mb-2">Tool Output</div>
              <pre className="text-[10px] font-mono text-space-dim bg-space-bg rounded p-2
                              max-h-80 overflow-y-auto whitespace-pre-wrap break-all">
                {lastStderr}
              </pre>
            </div>
          )}
        </div>
      </div>

      {/* Export */}
      <div className="px-3 py-3 border-t border-space-border">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[10px] uppercase tracking-wider text-space-dim">Export</div>
          {exportStatus && (
            <span className="text-[10px] text-space-success animate-pulse">{exportStatus}</span>
          )}
        </div>
        <div className="space-y-1.5">
          <div className="flex gap-1">
            <Tooltip text={`Auto-select texture resolution based on triangle count${autoRes ? ` (${autoRes}px)` : ""}`} position="left">
              <button
                onClick={() => handleExportGLB("auto")}
                disabled={!currentMeshObj || isExporting}
                className="flex-1 px-2 py-1 text-[11px] rounded bg-space-warm/20 text-space-warm
                           hover:bg-space-warm/30 transition-colors
                           disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isExporting ? "Baking..." : `GLB Auto${autoRes ? ` (${autoRes})` : ""}`}
              </button>
            </Tooltip>
            <Tooltip text="Export GLB with baked albedo texture (1024px)" position="left">
              <button
                onClick={() => handleExportGLB(1024)}
                disabled={!currentMeshObj || isExporting}
                className="flex-1 px-2 py-1 text-[11px] rounded bg-space-accent/20 text-space-accent
                           hover:bg-space-accent/30 transition-colors
                           disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isExporting ? "Baking..." : "GLB 1K"}
              </button>
            </Tooltip>
            <Tooltip text="Export GLB with baked albedo texture (2048px)" position="left">
              <button
                onClick={() => handleExportGLB(2048)}
                disabled={!currentMeshObj || isExporting}
                className="flex-1 px-2 py-1 text-[11px] rounded bg-space-accent/20 text-space-accent
                           hover:bg-space-accent/30 transition-colors
                           disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {isExporting ? "Baking..." : "GLB 2K"}
              </button>
            </Tooltip>
          </div>
          <div className="flex gap-1">
            <Tooltip text="Save pipeline configuration as JSON" position="left">
              <button
                onClick={handleExportParams}
                className="flex-1 px-2 py-1 text-[11px] rounded bg-space-border/30 text-space-text
                           hover:bg-space-border/50 transition-colors"
              >
                Save params
              </button>
            </Tooltip>
            <Tooltip text="Load pipeline configuration from JSON" position="left">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 px-2 py-1 text-[11px] rounded bg-space-border/30 text-space-text
                           hover:bg-space-border/50 transition-colors"
              >
                Load params
              </button>
            </Tooltip>
            <Tooltip text="Copy shareable link with current pipeline settings" position="left">
              <button
                onClick={handleShare}
                className="flex-1 px-2 py-1 text-[11px] rounded bg-space-success/20 text-space-success
                           hover:bg-space-success/30 transition-colors"
              >
                Share
              </button>
            </Tooltip>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              onChange={handleImportParams}
              className="hidden"
            />
          </div>
        </div>
      </div>

      {/* About */}
      <div className="px-3 py-3 border-t border-space-border mt-auto">
        <div className="text-[10px] uppercase tracking-wider text-space-dim mb-1.5">About</div>
        <p className="text-[10px] text-space-dim leading-relaxed mb-2">
          Procedural asteroid mesh generator built on rocktools by Mark J. Stock.
          WASM-compiled C tools, client-side mesh modifiers, and real-time shader effects.
        </p>
        <div className="flex flex-col gap-1 mb-3">
          <a
            href="https://github.com/kafeg/rocktools"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-space-accent hover:underline"
          >
            github.com/kafeg/rocktools ↗
          </a>
          <a
            href="https://markjstock.org/rocktools/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[10px] text-space-dim hover:underline hover:text-space-text"
          >
            rocktools by Mark J. Stock ↗
          </a>
        </div>
        <div className="text-[9px] text-space-dim/50 font-mono">
          v{__APP_VERSION__} · {__BUILD_DATE__}
        </div>
      </div>
    </div>
  );
}
