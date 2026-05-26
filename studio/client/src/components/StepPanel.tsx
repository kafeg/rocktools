import { useStudioStore } from "../stores/useStudioStore";
import Tooltip from "./Tooltip";
import type { PipelineStep } from "../types";

interface Props {
  step: PipelineStep;
  index: number;
}

export default function StepPanel({ step, index }: Props) {
  const tools = useStudioStore((s) => s.tools);
  const collapsedSteps = useStudioStore((s) => s.collapsedSteps);
  const { removeStep, moveStep, updateStepParam, toggleStepCollapsed, toggleStepEnabled } = useStudioStore();

  const toolDef = tools.find((t) => t.name === step.tool);
  if (!toolDef) return null;

  const isCollapsed = !!collapsedSteps[step.id];
  const isEnabled = step.enabled !== false;

  return (
    <div className={`border rounded-lg overflow-hidden ${isEnabled ? "border-space-border" : "border-space-border/30 opacity-50"}`}>
      {/* Step header */}
      <div
        className="flex items-center justify-between px-2 py-1.5 bg-space-border/20 cursor-pointer select-none"
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
          <span className="text-xs font-medium text-space-accent">{step.tool}</span>
          {isCollapsed && (
            <span className="text-[10px] text-space-dim ml-1">
              ({toolDef.params.filter((p) => {
                const v = step.params[p.name];
                return v !== undefined && v !== p.default;
              }).length} modified)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Tooltip text="Move step up" position="top">
            <button
              onClick={() => moveStep(step.id, "up")}
              className="px-1 text-space-dim hover:text-space-text text-xs"
            >
              ▲
            </button>
          </Tooltip>
          <Tooltip text="Move step down" position="top">
            <button
              onClick={() => moveStep(step.id, "down")}
              className="px-1 text-space-dim hover:text-space-text text-xs"
            >
              ▼
            </button>
          </Tooltip>
          <Tooltip text="Remove step from pipeline" position="top">
            <button
              onClick={() => removeStep(step.id)}
              className="px-1 text-space-dim hover:text-space-danger text-xs ml-1"
            >
              ✕
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Parameters (collapsible) */}
      {!isCollapsed && (
        <div className="px-2 py-2 space-y-2">
          {toolDef.params.map((param) => {
            const value = step.params[param.name] ?? param.default;

            if (param.type === "boolean") {
              return (
                <div key={param.name}>
                  <Tooltip text={param.description} position="right" delay={600}>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={value === true}
                        onChange={(e) => updateStepParam(step.id, param.name, e.target.checked)}
                        className="rounded border-space-border"
                      />
                      <span className="text-[11px] text-space-text">{param.name}</span>
                    </label>
                  </Tooltip>
                </div>
              );
            }

            if (param.type === "select") {
              return (
                <div key={param.name}>
                  <Tooltip text={param.description} position="right" delay={600}>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-space-dim w-24 shrink-0">{param.name}</span>
                      <select
                        value={String(value)}
                        onChange={(e) => updateStepParam(step.id, param.name, e.target.value)}
                        className="flex-1 bg-space-bg border border-space-border rounded px-1.5 py-0.5
                                   text-[11px] text-space-text"
                      >
                        {param.options?.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    </div>
                  </Tooltip>
                </div>
              );
            }

            return (
              <div key={param.name}>
                <Tooltip text={param.description} position="right" delay={600}>
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] text-space-dim">{param.name}</span>
                    <input
                      type="number"
                      value={Number(value)}
                      min={param.min}
                      max={param.max}
                      step={param.step ?? (param.type === "integer" ? 1 : 0.01)}
                      onChange={(e) => {
                        const v = param.type === "integer"
                          ? parseInt(e.target.value)
                          : parseFloat(e.target.value);
                        if (!isNaN(v)) updateStepParam(step.id, param.name, v);
                      }}
                      className="w-16 bg-space-bg border border-space-border rounded px-1.5 py-0.5
                                 text-[11px] text-space-text text-right font-mono"
                    />
                  </div>
                </Tooltip>
                {param.min !== undefined && param.max !== undefined && (
                  <input
                    type="range"
                    value={Number(value)}
                    min={param.min}
                    max={param.max}
                    step={param.step ?? (param.type === "integer" ? 1 : 0.01)}
                    onChange={(e) => {
                      const v = param.type === "integer"
                        ? parseInt(e.target.value)
                        : parseFloat(e.target.value);
                      updateStepParam(step.id, param.name, v);
                    }}
                    className="w-full"
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
