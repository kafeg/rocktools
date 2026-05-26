import { useStudioStore, MESH_STEPS, type MeshStepType } from "../stores/useStudioStore";
import Tooltip from "./Tooltip";
import type { PipelineStep } from "../types";

const PARAM_META: Record<string, { label: string; tip: string; min: number; max: number; step: number; type: "slider" | "integer" | "select" | "toggle" }> = {
  // Craters
  count:        { label: "Count",       tip: "Number of craters to generate",             min: 1,    max: 30,   step: 1,    type: "integer" },
  minSize:      { label: "Min size",    tip: "Minimum crater diameter (fraction of mesh)", min: 0.005, max: 0.2, step: 0.005, type: "slider" },
  maxSize:      { label: "Max size",    tip: "Maximum crater diameter (fraction of mesh)", min: 0.05, max: 0.6,  step: 0.01, type: "slider" },
  depthRatio:   { label: "Depth",       tip: "Depth-to-diameter ratio (Pike 1977: ~0.2)",  min: 0.05, max: 0.5,  step: 0.01, type: "slider" },
  rimHeight:    { label: "Rim",         tip: "Rim uplift relative to diameter",            min: 0,    max: 0.2,  step: 0.005, type: "slider" },
  rimWidth:     { label: "Rim width",   tip: "Width of rim falloff",                       min: 0.05, max: 0.6,  step: 0.05, type: "slider" },
  ejectaExtent: { label: "Ejecta",      tip: "Ejecta blanket extent beyond rim",           min: 0,    max: 1.0,  step: 0.05, type: "slider" },
  degradation:  { label: "Degradation", tip: "0 = all fresh, 1 = heavily weathered",       min: 0,    max: 1,    step: 0.05, type: "slider" },
  sizeExponent: { label: "Size dist.",  tip: "Power-law exponent (higher = more small)",   min: 1.5,  max: 5,    step: 0.1,  type: "slider" },
  spacing:      { label: "Spacing",     tip: "Intra-crater spacing (0=off, 1=strict)",     min: 0,    max: 1,    step: 0.05, type: "slider" },
  // Boulders
  height:       { label: "Height",      tip: "Boulder protrusion height relative to size", min: 0.1,  max: 2.0,  step: 0.05, type: "slider" },
  roughness:    { label: "Roughness",   tip: "Shape irregularity (0=round, 1=angular)",    min: 0,    max: 1,    step: 0.05, type: "slider" },
  smoothing:    { label: "Smoothing",   tip: "Post-displacement smoothing passes (0-3)",   min: 0,    max: 3,    step: 1,    type: "integer" },
  // Ridges
  width:        { label: "Width",       tip: "Ridge/groove cross-section width",           min: 0.01, max: 0.2,  step: 0.005, type: "slider" },
  length:       { label: "Length",       tip: "Arc length fraction (0-1 of hemisphere)",    min: 0.1,  max: 1.0,  step: 0.05, type: "slider" },
  irregularity: { label: "Irregularity", tip: "Height variation along the ridge",          min: 0,    max: 1,    step: 0.05, type: "slider" },
  // Fissures
  depth:        { label: "Depth",       tip: "Fissure depth relative to mesh radius",     min: 0.005, max: 0.05, step: 0.001, type: "slider" },
  branching:    { label: "Branching",   tip: "Probability of spawning side branches",      min: 0,    max: 1,    step: 0.05, type: "slider" },
  jaggedness:   { label: "Jagged",      tip: "Path direction randomness (0=straight)",     min: 0,    max: 1,    step: 0.05, type: "slider" },
  // Layers
  layers:       { label: "Layers",      tip: "Number of radial stratification bands",      min: 2,    max: 12,   step: 1,    type: "integer" },
  displacement: { label: "Depth",       tip: "Layer step displacement magnitude",          min: 0.005, max: 0.08, step: 0.005, type: "slider" },
  noise:        { label: "Noise",       tip: "Boundary irregularity (0=spherical bands)",  min: 0,    max: 1,    step: 0.05, type: "slider" },
  sharpness:    { label: "Sharpness",   tip: "Edge sharpness (0=smooth, 1=hard step)",     min: 0,    max: 1,    step: 0.05, type: "slider" },
  // Common
  seed:         { label: "Seed",        tip: "Random seed for reproducible results",       min: 1,    max: 999999, step: 1, type: "integer" },
  avoidOverlap: { label: "Avoid overlap", tip: "Skip vertices already displaced by previous modifiers", min: 0, max: 1, step: 1, type: "toggle" },
};

// Per-step-type overrides — takes priority over PARAM_META for specific mesh modifier types
type ParamMetaEntry = { label: string; tip: string; min: number; max: number; step: number; type: "slider" | "integer" | "select" | "toggle" };
const STEP_PARAM_OVERRIDES: Record<string, Record<string, ParamMetaEntry>> = {
  "mesh:pits": {
    count:         { label: "Count",     tip: "Number of degassing pits",                          min: 5,     max: 100, step: 1,    type: "integer" },
    minSize:       { label: "Min size",  tip: "Minimum pit diameter (fraction of mesh radius)",     min: 0.003, max: 0.08, step: 0.001, type: "slider" },
    maxSize:       { label: "Max size",  tip: "Maximum pit diameter (fraction of mesh radius)",     min: 0.01,  max: 0.15, step: 0.005, type: "slider" },
    depth:         { label: "Depth",     tip: "Pit depth relative to diameter",                    min: 0.02,  max: 0.4,  step: 0.01, type: "slider" },
    wallSteepness: { label: "Steepness", tip: "Wall angle (0=gentle slope, 1=near-vertical)",      min: 0,     max: 1,    step: 0.05, type: "slider" },
  },
  "mesh:erosion": {
    intensity:     { label: "Intensity",  tip: "Erosion displacement magnitude per pass",           min: 0.05, max: 1,   step: 0.05, type: "slider" },
    passes:        { label: "Passes",     tip: "Number of erosion iterations (1-5)",                min: 1,    max: 5,   step: 1,    type: "integer" },
    curvatureBias: { label: "Bias",       tip: "0=symmetric, 1=preserve concavities (sharpen only peaks)", min: 0, max: 1, step: 0.05, type: "slider" },
  },
  "mesh:facets": {
    count:    { label: "Count",    tip: "Number of planar facets to create",             min: 1,  max: 30, step: 1,    type: "integer" },
    size:     { label: "Size",     tip: "Facet radius (fraction of mesh radius)",        min: 0.05, max: 0.8, step: 0.05, type: "slider" },
    flatness: { label: "Flatness", tip: "How flat the facets become (0=none, 1=fully flat)", min: 0, max: 1, step: 0.05, type: "slider" },
  },
  "mesh:rocks": {
    count:      { label: "Count",     tip: "Number of rock objects to scatter on the surface", min: 1,     max: 60,  step: 1,    type: "integer" },
    minSize:    { label: "Min size",  tip: "Minimum rock size (fraction of mesh radius)",      min: 0.005, max: 0.15, step: 0.005, type: "slider" },
    maxSize:    { label: "Max size",  tip: "Maximum rock size (fraction of mesh radius)",      min: 0.01,  max: 0.25, step: 0.005, type: "slider" },
    roughness:  { label: "Roughness", tip: "Rock shape irregularity (0=smooth, 1=jagged)",     min: 0,     max: 1,   step: 0.05,  type: "slider" },
    detail:     { label: "Detail",    tip: "Subdivision levels (1=low poly, 3=smooth)",        min: 1,     max: 3,   step: 1,     type: "integer" },
    embedDepth: { label: "Embed",     tip: "How deep rocks sit in surface (0=on top, 0.8=mostly buried)", min: 0, max: 0.8, step: 0.05, type: "slider" },
    templates:  { label: "Templates", tip: "Number of unique rock shapes to generate",        min: 1,     max: 8,   step: 1,     type: "integer" },
  },
};

const SELECT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  mode: [
    { value: "ridge", label: "Ridge (raised)" },
    { value: "groove", label: "Groove (sunken)" },
  ],
};

interface Props {
  step: PipelineStep;
  index: number;
}

export default function MeshStepPanel({ step, index }: Props) {
  const collapsedSteps = useStudioStore((s) => s.collapsedSteps);
  const { removeStep, moveStep, updateStepParam, toggleStepCollapsed, toggleStepEnabled } = useStudioStore();

  const meshDef = MESH_STEPS[step.tool as MeshStepType];
  if (!meshDef) return null;

  const isCollapsed = !!collapsedSteps[step.id];
  const isEnabled = step.enabled !== false;
  const paramKeys = Object.keys(meshDef.params);

  return (
    <div className={`border rounded-lg overflow-hidden ${isEnabled ? "border-space-accent/30" : "border-space-border/30 opacity-50"}`}>
      <div
        className="flex items-center justify-between px-2 py-1.5 bg-space-accent/8 cursor-pointer select-none"
        onClick={() => toggleStepCollapsed(step.id)}
      >
        <div className="flex items-center gap-2">
          <span onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={() => toggleStepEnabled(step.id)}
              className="accent-space-accent w-3.5 h-3.5 cursor-pointer"
            />
          </span>
          <span className="text-[10px] text-space-dim font-mono">{index + 1}</span>
          <span className="text-xs font-medium text-space-accent">{meshDef.label}</span>
          <span className="text-[9px] text-space-dim px-1 py-0.5 rounded bg-space-accent/10">mesh</span>
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Tooltip text="Move modifier up" position="top">
            <button
              onClick={() => moveStep(step.id, "up")}
              className="px-1 text-space-dim hover:text-space-text text-xs"
            >
              ▲
            </button>
          </Tooltip>
          <Tooltip text="Move modifier down" position="top">
            <button
              onClick={() => moveStep(step.id, "down")}
              className="px-1 text-space-dim hover:text-space-text text-xs"
            >
              ▼
            </button>
          </Tooltip>
          <Tooltip text={`Remove ${meshDef.label} modifier`} position="top">
            <button
              onClick={() => removeStep(step.id)}
              className="px-1 text-space-dim hover:text-space-danger text-xs ml-1"
            >
              ✕
            </button>
          </Tooltip>
        </div>
      </div>

      {!isCollapsed && (
        <div className="px-2 py-2 space-y-1.5">
          {paramKeys.map((key) => {
            if (SELECT_OPTIONS[key]) {
              const value = String(step.params[key] ?? (meshDef.params as Record<string, unknown>)[key]);
              return (
                <div key={key}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] text-space-dim">{STEP_PARAM_OVERRIDES[step.tool]?.[key]?.label ?? PARAM_META[key]?.label ?? key}</span>
                    <select
                      value={value}
                      onChange={(e) => updateStepParam(step.id, key, e.target.value)}
                      className="text-[10px] bg-space-bg border border-space-border rounded px-1 py-0.5 text-space-text"
                    >
                      {SELECT_OPTIONS[key]!.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            }

            const meta = STEP_PARAM_OVERRIDES[step.tool]?.[key] ?? PARAM_META[key];
            if (!meta) return null;
            const value = step.params[key] ?? (meshDef.params as Record<string, number | string | boolean>)[key];

            if (meta.type === "toggle") {
              const checked = value === true || value === "true";
              return (
                <div key={key}>
                  <Tooltip text={meta.tip} position="right" delay={500}>
                    <label className="flex items-center justify-between w-full cursor-pointer">
                      <span className="text-[11px] text-space-dim">{meta.label}</span>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => updateStepParam(step.id, key, e.target.checked)}
                        className="rounded border-space-border"
                      />
                    </label>
                  </Tooltip>
                </div>
              );
            }

            return (
              <div key={key}>
                <Tooltip text={meta.tip} position="right" delay={500}>
                  <div className="flex items-center justify-between mb-0.5 w-full">
                    <span className="text-[11px] text-space-dim">{meta.label}</span>
                    <span className="text-[10px] text-space-text font-mono w-12 text-right">
                      {meta.type === "integer" ? Math.round(Number(value)) : Number(value).toFixed(3)}
                    </span>
                  </div>
                </Tooltip>
                <input
                  type="range"
                  value={Number(value)}
                  min={meta.min}
                  max={meta.max}
                  step={meta.step}
                  onChange={(e) => updateStepParam(step.id, key, meta.type === "integer" ? Math.round(parseFloat(e.target.value)) : parseFloat(e.target.value))}
                  className="w-full"
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
