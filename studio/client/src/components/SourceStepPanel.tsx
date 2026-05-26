import { useStudioStore } from "../stores/useStudioStore";
import Tooltip from "./Tooltip";

export default function SourceStepPanel() {
  const sourceType = useStudioStore((s) => s.sourceType);
  const baseMesh = useStudioStore((s) => s.baseMesh);
  const createParams = useStudioStore((s) => s.createParams);
  const samples = useStudioStore((s) => s.samples);
  const tools = useStudioStore((s) => s.tools);
  const collapsedSteps = useStudioStore((s) => s.collapsedSteps);
  const { toggleStepCollapsed } = useStudioStore();

  const store = useStudioStore;
  const isCollapsed = !!collapsedSteps["source"];
  const createTool = tools.find((t) => t.name === "rockcreate");

  return (
    <div className="border border-space-accent/30 rounded-lg overflow-hidden">
      <div
        className="flex items-center justify-between px-2 py-1.5 bg-space-accent/8 cursor-pointer select-none"
        onClick={() => toggleStepCollapsed("source")}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-space-dim font-mono w-3">{isCollapsed ? "▸" : "▾"}</span>
          <span className="text-[10px] text-space-dim font-mono">1</span>
          <span className="text-xs font-medium text-space-accent">source</span>
          <span className="text-[9px] text-space-dim px-1 py-0.5 rounded bg-space-accent/10">
            {sourceType === "sample" ? baseMesh : "rockcreate"}
          </span>
        </div>
      </div>

      {!isCollapsed && (
        <div className="px-2 py-2 space-y-2">
          <div className="flex gap-1">
            <Tooltip text="Use a pre-generated base mesh as starting shape" position="bottom">
              <button
                onClick={() => store.getState().setSourceType("sample")}
                className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                  sourceType === "sample"
                    ? "bg-space-accent/20 text-space-accent border border-space-accent/40"
                    : "bg-space-border/30 text-space-text border border-transparent hover:bg-space-border/50"
                }`}
              >
                Base Mesh
              </button>
            </Tooltip>
            <Tooltip text="Generate new convex hull from random points (rockcreate)" position="bottom">
              <button
                onClick={() => store.getState().setSourceType("create")}
                className={`px-2 py-0.5 text-[11px] rounded transition-colors ${
                  sourceType === "create"
                    ? "bg-space-accent/20 text-space-accent border border-space-accent/40"
                    : "bg-space-border/30 text-space-text border border-transparent hover:bg-space-border/50"
                }`}
              >
                rockcreate
              </button>
            </Tooltip>
          </div>

          {sourceType === "sample" ? (
            <div>
              <Tooltip text="Pre-generated OBJ meshes available as starting shapes" position="bottom">
                <select
                  value={baseMesh}
                  onChange={(e) => store.getState().setBaseMesh(e.target.value)}
                  className="w-full bg-space-bg border border-space-border rounded px-2 py-1 text-xs text-space-text"
                >
                  {samples.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </Tooltip>
            </div>
          ) : (
            <div className="space-y-2">
              {createTool?.params.map((param) => {
                const value = createParams[param.name] ?? param.default;
                if (param.type === "boolean") return null;
                return (
                  <div key={param.name}>
                    <Tooltip text={param.description} position="right" delay={600}>
                      <div className="flex items-center justify-between mb-0.5 w-full">
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
                            if (!isNaN(v)) store.getState().setCreateParam(param.name, v);
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
                          store.getState().setCreateParam(param.name, v);
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
      )}
    </div>
  );
}
