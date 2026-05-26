import { ASTEROID_TEXTURE_LIST } from "../runtime/asteroid";
import { useStudioStore, FX_STEPS, type FxStepType } from "../stores/useStudioStore";
import Tooltip from "./Tooltip";
import type { PipelineStep } from "../types";

const PARAM_META: Record<string, { label: string; tip: string; min: number; max: number; step: number; type: "slider" | "color" | "select" | "toggle" }> = {
  baseColor:           { label: "Color",      tip: "Primary surface color",                          min: 0, max: 1, step: 0.01, type: "color" },
  roughness:           { label: "Roughness",  tip: "0 = mirror, 1 = matte",                         min: 0, max: 1, step: 0.01, type: "slider" },
  metalness:           { label: "Metalness",  tip: "0 = rock/dielectric, 1 = pure metal",           min: 0, max: 1, step: 0.01, type: "slider" },
  texture:             { label: "Texture",    tip: "Triplanar-projected surface texture",            min: 0, max: 0, step: 0,    type: "select" },
  applyTint:           { label: "Tint",       tip: "Apply base color as tint over texture",          min: 0, max: 0, step: 0,    type: "toggle" },
  colorVariation:      { label: "Variation",  tip: "Noise-based color variation intensity",          min: 0, max: 1, step: 0.01, type: "slider" },
  colorVariationScale: { label: "Scale",      tip: "Pattern size (lower = larger patches)",          min: 0.5, max: 10, step: 0.1, type: "slider" },
  dustAmount:          { label: "Amount",     tip: "Dust settles in concavities, peaks stay clean",  min: 0, max: 1, step: 0.01, type: "slider" },
  dustColor:           { label: "Color",      tip: "Regolith / dust color",                          min: 0, max: 1, step: 0.01, type: "color" },
  veinIntensity:       { label: "Intensity",  tip: "Mineral vein visibility",                        min: 0, max: 1, step: 0.01, type: "slider" },
  veinScale:           { label: "Scale",      tip: "Vein pattern frequency",                         min: 1, max: 12, step: 0.5, type: "slider" },
  veinColor:           { label: "Color",      tip: "Vein material color",                            min: 0, max: 1, step: 0.01, type: "color" },
  subsurface:          { label: "Amount",     tip: "Light penetration for translucent materials",     min: 0, max: 1, step: 0.01, type: "slider" },
  featureIntensity:    { label: "Intensity",  tip: "Master feature shading intensity",               min: 0, max: 1, step: 0.01, type: "slider" },
  craterShading:       { label: "Craters",    tip: "Crater visual effects strength",                 min: 0, max: 3, step: 0.01, type: "slider" },
  craterTint:          { label: "Crater tint", tip: "Crater floor color tint",                       min: 0, max: 1, step: 0.01, type: "color" },
  boulderShading:      { label: "Boulders",   tip: "Boulder visual effects strength",                min: 0, max: 3, step: 0.01, type: "slider" },
  boulderTint:         { label: "Boulder tint", tip: "Boulder color tint",                           min: 0, max: 1, step: 0.01, type: "color" },
  ridgeShading:        { label: "Ridges",     tip: "Ridge visual effects strength",                  min: 0, max: 3, step: 0.01, type: "slider" },
  ridgeTint:           { label: "Ridge tint",  tip: "Ridge color tint",                              min: 0, max: 1, step: 0.01, type: "color" },
  fissureShading:      { label: "Fissures",   tip: "Fissure visual effects strength",                min: 0, max: 3, step: 0.01, type: "slider" },
  fissureTint:         { label: "Fissure tint", tip: "Fissure interior color",                       min: 0, max: 1, step: 0.01, type: "color" },
  layerShading:        { label: "Layers",     tip: "Layer visual effects strength",                  min: 0, max: 3, step: 0.01, type: "slider" },
  layerTint:           { label: "Layer tint",  tip: "Layer band color",                              min: 0, max: 1, step: 0.01, type: "color" },
  normalStrength:      { label: "Normals",    tip: "Micro-normal perturbation strength",             min: 0, max: 2, step: 0.01, type: "slider" },
  // fx:ao
  aoStrength:          { label: "Strength",  tip: "Ambient occlusion darkening intensity",         min: 0, max: 1, step: 0.01, type: "slider" },
  aoRadius:            { label: "Radius",    tip: "AO sampling radius (larger = broader shadows)", min: 0, max: 1, step: 0.01, type: "slider" },
  // fx:frost
  frostAmount:         { label: "Amount",    tip: "Frost coverage intensity",                      min: 0, max: 1, step: 0.01, type: "slider" },
  frostColor:          { label: "Color",     tip: "Frost color",                                   min: 0, max: 1, step: 0.01, type: "color" },
  frostBias:           { label: "Bias",      tip: "0=exposure-based, 1=concavity-based",           min: 0, max: 1, step: 0.01, type: "slider" },
  // fx:weathering
  weatherAmount:       { label: "Amount",    tip: "Weathering intensity on exposed surfaces",       min: 0, max: 1, step: 0.01, type: "slider" },
  weatherTint:         { label: "Tint",      tip: "Weathering darkening/reddening color",           min: 0, max: 1, step: 0.01, type: "color" },
  directionBias:       { label: "Direction",  tip: "0=curvature-based, 1=directional (solar wind)", min: 0, max: 1, step: 0.01, type: "slider" },
  // fx:emission
  emissionColor:       { label: "Color",     tip: "Emission glow color",                           min: 0, max: 1, step: 0.01, type: "color" },
  emissionIntensity:   { label: "Intensity", tip: "Emission brightness",                           min: 0, max: 2, step: 0.01, type: "slider" },
  emissionPattern:     { label: "Pattern",   tip: "Emission distribution pattern",                 min: 0, max: 0, step: 0,    type: "select" },
};


const FX_SELECT_OPTIONS: Record<string, { value: string; label: string }[]> = {
  emissionPattern: [
    { value: "spots", label: "Spots" },
    { value: "veins", label: "Veins" },
    { value: "patches", label: "Patches" },
  ],
};

interface Props {
  step: PipelineStep;
  index: number;
}

export default function FxStepPanel({ step, index }: Props) {
  const collapsedSteps = useStudioStore((s) => s.collapsedSteps);
  const { removeStep, updateStepParam, toggleStepCollapsed, toggleStepEnabled } = useStudioStore();

  const fxDef = FX_STEPS[step.tool as FxStepType];
  if (!fxDef) return null;

  const isCollapsed = !!collapsedSteps[step.id];
  const isEnabled = step.enabled !== false;
  const paramKeys = Object.keys(fxDef.params);

  return (
    <div className={`border rounded-lg overflow-hidden ${isEnabled ? "border-space-warm/30" : "border-space-border/30 opacity-50"}`}>
      <div
        className="flex items-center justify-between px-2 py-1.5 bg-space-warm/8 cursor-pointer select-none"
        onClick={() => toggleStepCollapsed(step.id)}
      >
        <div className="flex items-center gap-2">
          <span onClick={(e) => e.stopPropagation()}>
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={() => toggleStepEnabled(step.id)}
              className="accent-space-warm w-3.5 h-3.5 cursor-pointer"
            />
          </span>
          <span className="text-[10px] text-space-dim font-mono">{index + 1}</span>
          <span className="text-xs font-medium text-space-warm">{fxDef.label}</span>
          <span className="text-[9px] text-space-dim px-1 py-0.5 rounded bg-space-warm/10">fx</span>
        </div>
        <div onClick={(e) => e.stopPropagation()}>
          <Tooltip text={`Remove ${fxDef.label} effect`} position="top">
            <button
              onClick={() => removeStep(step.id)}
              className="px-1 text-space-dim hover:text-space-danger text-xs"
            >
              ✕
            </button>
          </Tooltip>
        </div>
      </div>

      {!isCollapsed && (
        <div className="px-2 py-2 space-y-1.5">
          {paramKeys.map((key) => {
            const meta = PARAM_META[key];
            if (!meta) return null;
            const value = step.params[key] ?? (fxDef.params as Record<string, number | string>)[key];

            if (meta.type === "select") {
              const customOpts = FX_SELECT_OPTIONS[key];
              return (
                <div key={key}>
                  <Tooltip text={meta.tip} position="right" delay={500}>
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[11px] text-space-dim">{meta.label}</span>
                      <select
                        value={String(value)}
                        onChange={(e) => updateStepParam(step.id, key, e.target.value)}
                        className="text-[10px] bg-space-panel border border-space-border rounded px-1 py-0.5
                                   text-space-text cursor-pointer max-w-[140px]"
                      >
                        {customOpts
                          ? customOpts.map((o) => (
                              <option key={o.value} value={o.value}>{o.label}</option>
                            ))
                          : ASTEROID_TEXTURE_LIST.map((t) => (
                              <option key={t} value={t}>{t === "none" ? "-- none --" : t.replace(/_/g, " ")}</option>
                            ))
                        }
                      </select>
                    </div>
                  </Tooltip>
                </div>
              );
            }

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
                        className="accent-space-accent"
                      />
                    </label>
                  </Tooltip>
                </div>
              );
            }

            if (meta.type === "color") {
              return (
                <div key={key}>
                  <Tooltip text={meta.tip} position="right" delay={500}>
                    <div className="flex items-center justify-between w-full">
                      <span className="text-[11px] text-space-dim">{meta.label}</span>
                      <input
                        type="color"
                        value={String(value)}
                        onChange={(e) => updateStepParam(step.id, key, e.target.value)}
                        className="w-6 h-5 rounded border border-space-border cursor-pointer bg-transparent"
                      />
                    </div>
                  </Tooltip>
                </div>
              );
            }

            return (
              <div key={key}>
                <Tooltip text={meta.tip} position="right" delay={500}>
                  <div className="flex items-center justify-between mb-0.5 w-full">
                    <span className="text-[11px] text-space-dim">{meta.label}</span>
                    <span className="text-[10px] text-space-text font-mono w-10 text-right">
                      {Number(value).toFixed(2)}
                    </span>
                  </div>
                </Tooltip>
                <input
                  type="range"
                  value={Number(value)}
                  min={meta.min}
                  max={meta.max}
                  step={meta.step}
                  onChange={(e) => updateStepParam(step.id, key, parseFloat(e.target.value))}
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
