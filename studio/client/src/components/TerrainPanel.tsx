import { useEffect, useMemo, useRef, useState } from "react";
import { useStudioStore } from "../stores/useStudioStore";
import { exportTerrainGLB } from "../utils/export";
import { deriveTerrainStyle, type TerrainParams } from "../utils/terrain";

/** A labelled numeric slider matching the studio's control style. */
function Slider({
  label,
  value,
  min,
  max,
  step,
  onChange,
  fmt,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt?: (v: number) => string;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-0.5">
        <span className="font-sans text-[10px] text-space-dim">{label}</span>
        <span className="font-mono text-[10px] text-space-text">{fmt ? fmt(value) : value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-space-accent"
      />
    </label>
  );
}

export default function TerrainPanel() {
  const viewMode = useStudioStore((s) => s.viewMode);
  const surfaceSeed = useStudioStore((s) => s.surfaceSeed);
  const params = useStudioStore((s) => s.terrainParams);
  const info = useStudioStore((s) => s.terrainInfo);
  const meta = useStudioStore((s) => s.terrainMeta);
  const variants = useStudioStore((s) => s.terrainVariants);
  const isGenerating = useStudioStore((s) => s.isGeneratingTerrain);
  const hasMesh = useStudioStore((s) => !!s.currentMeshObj);
  const instant = useStudioStore((s) => s.instantGenerate);

  // Instant mode: auto-regenerate the terrain (debounced) when params change,
  // matching the asteroid pipeline's behaviour. Baseline on mount so merely
  // opening the panel / switching tabs doesn't trigger a regen. Seed changes go
  // through 🎲 / Generate / variant-select which already regenerate explicitly.
  const paramsKey = JSON.stringify(params);
  const prevKeyRef = useRef<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (!instant) { prevKeyRef.current = paramsKey; return; }
    if (prevKeyRef.current === null) { prevKeyRef.current = paramsKey; return; }
    if (prevKeyRef.current === paramsKey) return;
    prevKeyRef.current = paramsKey;
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => useStudioStore.getState().generateTerrain(), 500);
    return () => clearTimeout(debounceRef.current);
  }, [paramsKey, instant]);

  // What this terrain inherits from the current asteroid (style, not seed).
  const steps = useStudioStore((s) => s.steps);
  const createParams = useStudioStore((s) => s.createParams);
  const style = useMemo(() => deriveTerrainStyle(steps, createParams), [steps, createParams]);

  const [isExporting, setIsExporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const store = useStudioStore;
  const setParam = (name: keyof TerrainParams, v: number) => store.getState().setTerrainParam(name, v);

  function flash(msg: string) {
    setStatus(msg);
    setTimeout(() => setStatus(null), 2000);
  }

  async function handleExport(resolution: number) {
    const st = store.getState();
    if (!st.terrainMesh) return;
    setIsExporting(true);
    try {
      const shaderParams = st.collectShaderParams();
      await exportTerrainGLB(st.terrainMesh, st.terrainScatter, shaderParams, resolution, st.surfaceSeed, st.terrainMeta);
      flash(`GLB ${resolution}px exported`);
    } catch (e) {
      store.getState().setError(`Terrain export failed: ${e}`);
    } finally {
      setIsExporting(false);
    }
  }

  if (viewMode !== "surface") {
    return (
      <div className="p-4 text-center text-space-dim text-xs">
        Switch to <span className="text-space-accent">Surface</span> mode to generate terrain
        from the current asteroid.
      </div>
    );
  }

  if (!hasMesh) {
    return (
      <div className="p-4 text-center text-space-dim text-xs">
        Generate an asteroid first — terrain inherits its style.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-space-border flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-widest text-space-dim font-semibold">Surface Terrain</h2>
        {status && <span className="text-[10px] text-space-success animate-pulse">{status}</span>}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Inherited style — terrain reuses the asteroid's modifiers + look */}
        <div className="space-y-1 rounded border border-space-border/40 bg-space-border/10 px-2 py-2">
          <div className="text-[10px] uppercase tracking-wider text-space-dim">Inherited from asteroid</div>
          <div className="text-[10px] font-mono space-y-0.5">
            <div className="flex justify-between"><span className="text-space-dim">Seed</span><span>{style.asteroidSeed}</span></div>
            <div className="flex justify-between">
              <span className="text-space-dim">Relief</span>
              <span>base {Math.round(style.base.amplitudeFrac * 100)}%{style.mountains ? ` · mtns ${Math.round(style.mountains.heightFrac * 100)}%` : ""}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-space-dim">Features</span>
              <span>
                {[
                  style.craters ? `craters ${style.craters.count}` : null,
                  style.ridges ? `ridges ${style.ridges.count}` : null,
                  style.fissures ? `fissures ${style.fissures.count}` : null,
                ].filter(Boolean).join(", ") || "—"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-space-dim">Rocks base</span>
              <span>{style.rocks.count} · {style.rocks.templates} tmpl</span>
            </div>
          </div>
          <p className="text-[9px] text-space-dim leading-snug">Same material &amp; modifier style; only the seed varies per terrain.</p>
        </div>

        {/* Variant seed — the single knob for variants */}
        <div className="space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-space-dim">Variant Seed</div>
          <div className="flex items-center gap-1">
            <input
              type="number"
              value={surfaceSeed}
              onChange={(e) => store.getState().setSurfaceSeed(Math.max(1, Math.round(Number(e.target.value) || 1)))}
              className="flex-1 min-w-0 bg-space-panel border border-space-border/40 rounded px-2 py-1 text-[11px] font-mono text-space-text"
            />
            <button
              onClick={() => store.getState().randomizeSurfaceSeed()}
              className="px-2 py-1 rounded text-[10px] font-mono border border-space-border/30 hover:bg-space-border/20 cursor-pointer transition-colors"
              title="Random variant"
            >
              🎲
            </button>
            <button
              onClick={() => store.getState().generateTerrain()}
              disabled={isGenerating}
              className="px-2 py-1 rounded text-[10px] font-mono border border-space-accent/40 text-space-accent hover:bg-space-accent/10 cursor-pointer transition-colors disabled:opacity-50"
            >
              {isGenerating ? "…" : "Generate"}
            </button>
          </div>
          <p className="text-[9px] text-space-dim leading-snug">
            Changing the seed reshuffles this terrain. The asteroid stays identical.
          </p>
        </div>

        {/* Saved variants */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wider text-space-dim">Variants</div>
            <button
              onClick={() => store.getState().addTerrainVariant()}
              className="px-1.5 py-0.5 rounded text-[10px] font-mono border border-space-border/30 hover:bg-space-border/20 cursor-pointer transition-colors"
            >
              + save current
            </button>
          </div>
          {variants.length === 0 ? (
            <p className="text-[9px] text-space-dim">No saved variants yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {variants.map((seed) => (
                <button
                  key={seed}
                  onClick={() => store.getState().selectTerrainVariant(seed)}
                  className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors cursor-pointer ${
                    seed === surfaceSeed
                      ? "border-space-accent text-space-accent"
                      : "border-space-border/30 hover:bg-space-border/20"
                  }`}
                >
                  #{seed}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Size & detail */}
        <div className="space-y-2.5">
          <div className="text-[10px] uppercase tracking-wider text-space-dim">Size &amp; Detail</div>
          <Slider label="Footprint" value={params.footprint} min={1} max={20} step={0.5}
            onChange={(v) => setParam("footprint", v)} fmt={(v) => v.toFixed(1)} />
          <Slider label="Resolution" value={params.resolution} min={64} max={768} step={32}
            onChange={(v) => setParam("resolution", v)} fmt={(v) => `${v}²`} />
          <Slider label="Detail boost" value={params.detailBoost} min={0.5} max={4} step={0.25}
            onChange={(v) => setParam("detailBoost", v)} fmt={(v) => `${v}×`} />
          <Slider label="Erosion" value={params.erosion} min={0} max={1} step={0.05}
            onChange={(v) => setParam("erosion", v)} fmt={(v) => v.toFixed(2)} />
        </div>

        {/* Feature density — override inherited features (0× = off) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-wider text-space-dim">Density</div>
            <span className="text-[9px] text-space-dim">0× = off</span>
          </div>
          <Slider label="Mountains" value={params.mountainAmount} min={0} max={2} step={0.1}
            onChange={(v) => setParam("mountainAmount", v)} fmt={(v) => `${v.toFixed(1)}×`} />
          {style.craters && (
            <Slider label="Craters" value={params.craterDensity} min={0} max={4} step={0.25}
              onChange={(v) => setParam("craterDensity", v)} fmt={(v) => `${v}×`} />
          )}
          {style.fissures && (
            <Slider label="Fissures" value={params.fissureDensity} min={0} max={3} step={0.25}
              onChange={(v) => setParam("fissureDensity", v)} fmt={(v) => `${v}×`} />
          )}
          {style.ridges && (
            <Slider label="Ridges" value={params.ridgeDensity} min={0} max={3} step={0.25}
              onChange={(v) => setParam("ridgeDensity", v)} fmt={(v) => `${v}×`} />
          )}
          <Slider label="Rocks" value={params.rockDensity} min={0} max={24} step={1}
            onChange={(v) => setParam("rockDensity", v)} fmt={(v) => `${v}×`} />
        </div>

        {info && (
          <div className="space-y-1 text-[11px] font-mono pt-1 border-t border-space-border/40">
            <div className="flex justify-between"><span className="text-space-dim">Vertices</span><span>{info.nodes.toLocaleString()}</span></div>
            <div className="flex justify-between"><span className="text-space-dim">Triangles</span><span>{info.tris.toLocaleString()}</span></div>
            {meta && (
              <>
                <div className="flex justify-between"><span className="text-space-dim">Rocks</span><span>{meta.stats.rockCount.toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-space-dim">Flat area</span><span>{Math.round(meta.stats.flatFraction * 100)}%</span></div>
                <div className="flex justify-between"><span className="text-space-dim">Landing pads</span><span>{meta.landingPads.length}</span></div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Export */}
      <div className="px-3 py-3 border-t border-space-border space-y-1.5">
        <div className="text-[10px] uppercase tracking-wider text-space-dim mb-1">Export Terrain</div>
        <div className="flex gap-1">
          <button onClick={() => handleExport(1024)} disabled={!info || isExporting}
            className="flex-1 px-1.5 py-1 rounded text-[10px] font-mono border border-space-border/30 hover:bg-space-border/20 cursor-pointer transition-colors disabled:opacity-50">
            {isExporting ? "Baking…" : "GLB 1K"}
          </button>
          <button onClick={() => handleExport(2048)} disabled={!info || isExporting}
            className="flex-1 px-1.5 py-1 rounded text-[10px] font-mono border border-space-border/30 hover:bg-space-border/20 cursor-pointer transition-colors disabled:opacity-50">
            {isExporting ? "Baking…" : "GLB 2K"}
          </button>
        </div>
      </div>
    </div>
  );
}
