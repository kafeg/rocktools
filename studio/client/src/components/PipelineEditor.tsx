import { useEffect, useRef, useCallback } from "react";
import { useStudioStore, FX_STEPS, MESH_STEPS, type FullPreset, type FxStepType, type MeshStepType } from "../stores/useStudioStore";
import { useApi } from "../hooks/useApi";
import SourceStepPanel from "./SourceStepPanel";
import StepPanel from "./StepPanel";
import FxStepPanel from "./FxStepPanel";
import MeshStepPanel from "./MeshStepPanel";
import RandomMenu from "./RandomMenu";
import GenerateMenu from "./GenerateMenu";
import Tooltip from "./Tooltip";

const FX_BUTTONS: { type: FxStepType; label: string }[] = [
  { type: "fx:material", label: "material" },
  { type: "fx:dust", label: "dust" },
  { type: "fx:veins", label: "veins" },
  { type: "fx:subsurface", label: "sss" },
  { type: "fx:ao", label: "ao" },
  { type: "fx:frost", label: "frost" },
  { type: "fx:weathering", label: "weather" },
  { type: "fx:emission", label: "emission" },
  { type: "fx:features", label: "features" },
];

const MESH_BUTTONS: { type: MeshStepType; label: string }[] = [
  { type: "mesh:craters", label: "craters" },
  { type: "mesh:boulders", label: "boulders" },
  { type: "mesh:rocks", label: "rocks" },
  { type: "mesh:ridges", label: "ridges" },
  { type: "mesh:fissures", label: "fissures" },
  { type: "mesh:layers", label: "layers" },
  { type: "mesh:pits", label: "pits" },
  { type: "mesh:erosion", label: "erosion" },
  { type: "mesh:facets", label: "facets" },
];

export default function PipelineEditor() {
  const { steps, sourceType, baseMesh, createParams, tools, isGenerating, instantGenerate } = useStudioStore();
  const { generate } = useApi();
  const store = useStudioStore;
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const prevStateRef = useRef<string>("");

  const triggerGenerate = useCallback(() => {
    if (!instantGenerate || isGenerating) return;
    const state = useStudioStore.getState();
    const pipelineSteps = state.getPipelineSteps();
    if (pipelineSteps.length === 0) return;

    const stateKey = JSON.stringify({
      sourceType: state.sourceType, baseMesh: state.baseMesh,
      createParams: state.createParams,
      steps: state.steps.filter((s) => !s.tool.startsWith("fx:") && !s.tool.startsWith("mesh:")),
    });
    if (stateKey === prevStateRef.current) return;
    prevStateRef.current = stateKey;

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => generate(), 800);
  }, [instantGenerate, isGenerating, generate]);

  useEffect(() => {
    if (instantGenerate) triggerGenerate();
  }, [steps, sourceType, baseMesh, createParams, instantGenerate, triggerGenerate]);

  function handleLoadPreset(preset: FullPreset) {
    store.getState().loadPreset(preset);
  }

  const availableTools = tools.filter((t) => ["rockdetail", "rocksmooth", "rockconvert", "rocktrim"].includes(t.name));

  function randomizeSeeds() {
    const newSeed = Math.floor(Math.random() * 999999) + 1;
    if (sourceType === "create") {
      store.getState().setCreateParam("seed", newSeed);
    }
    const state = store.getState();
    for (const step of state.steps) {
      if (step.params.seed !== undefined) {
        state.updateStepParam(step.id, "seed", newSeed);
      }
    }
  }

  const rockSteps = steps.filter((s) => !s.tool.startsWith("fx:") && !s.tool.startsWith("mesh:"));
  const meshSteps = steps.filter((s) => s.tool.startsWith("mesh:"));
  const fxSteps = steps.filter((s) => s.tool.startsWith("fx:"));

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 py-2 border-b border-space-border flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-widest text-space-dim font-semibold">Pipeline</h2>
        <Tooltip text="Randomize all seed values across pipeline steps" position="left">
          <button
            onClick={randomizeSeeds}
            className="px-2 py-0.5 text-[10px] rounded bg-space-warm/15 text-space-warm
                       hover:bg-space-warm/25 transition-colors font-mono"
          >
            ⟳ seed
          </button>
        </Tooltip>
      </div>

      {/* Scrollable steps area */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
        {/* Source step — always first */}
        <SourceStepPanel />

        {/* Rocktools transform steps */}
        {rockSteps.map((step, idx) => (
          <StepPanel key={step.id} step={step} index={idx + 1} />
        ))}

        {/* Mesh modifier steps */}
        {meshSteps.length > 0 && (
          <div className="text-[10px] uppercase tracking-wider text-space-dim mb-1 mt-2">Mesh Modifiers</div>
        )}
        {meshSteps.map((step, idx) => (
          <MeshStepPanel key={step.id} step={step} index={rockSteps.length + idx + 1} />
        ))}

        {rockSteps.length === 0 && meshSteps.length === 0 && fxSteps.length === 0 && (
          <div className="text-center text-space-dim text-xs py-4">
            Add steps to shape and shade the mesh
          </div>
        )}

        {/* FX steps */}
        {fxSteps.length > 0 && (
          <div className="text-[10px] uppercase tracking-wider text-space-dim mb-1 mt-2">Shader Effects</div>
        )}
        {fxSteps.map((step, idx) => (
          <FxStepPanel key={step.id} step={step} index={rockSteps.length + idx + 1} />
        ))}
      </div>

      {/* Add step buttons */}
      <div className="px-3 py-2 border-t border-space-border space-y-2">
        {/* Rocktools */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-space-dim mb-1">Add Transform</div>
          <div className="flex flex-wrap gap-1">
            {availableTools.map((t) => {
              const exists = steps.some((s) => s.tool === t.name);
              return (
                <Tooltip key={t.name} text={t.description} position="top">
                  <button
                    onClick={() => store.getState().addStep(t.name)}
                    disabled={exists}
                    className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${
                      exists
                        ? "border-space-border/30 text-space-dim/40 cursor-not-allowed"
                        : "border-space-border hover:border-space-accent hover:text-space-accent"
                    }`}
                  >
                    {t.name.replace("rock", "")}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* Mesh modifiers */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-space-dim mb-1">Add Mesh Modifier</div>
          <div className="flex flex-wrap gap-1">
            {MESH_BUTTONS.map((m) => {
              const def = MESH_STEPS[m.type];
              const exists = steps.some((s) => s.tool === m.type);
              return (
                <Tooltip key={m.type} text={def.description} position="top">
                  <button
                    onClick={() => store.getState().addMeshStep(m.type)}
                    disabled={exists}
                    className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${
                      exists
                        ? "border-space-border/30 text-space-dim/40 cursor-not-allowed"
                        : "border-space-accent/40 text-space-accent hover:border-space-accent hover:bg-space-accent/10"
                    }`}
                  >
                    {m.label}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>

        {/* Shader effects */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-space-dim mb-1">Add Effect</div>
          <div className="flex flex-wrap gap-1">
            {FX_BUTTONS.map((fx) => {
              const def = FX_STEPS[fx.type];
              const exists = steps.some((s) => s.tool === fx.type);
              return (
                <Tooltip key={fx.type} text={def.description} position="top">
                  <button
                    onClick={() => store.getState().addFxStep(fx.type)}
                    disabled={exists}
                    className={`px-2 py-0.5 text-[11px] rounded border transition-colors ${
                      exists
                        ? "border-space-border/30 text-space-dim/40 cursor-not-allowed"
                        : "border-space-warm/40 text-space-warm hover:border-space-warm hover:bg-space-warm/10"
                    }`}
                  >
                    {fx.label}
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>

      {/* Generate + Random */}
      <div className="px-3 py-3 border-t border-space-border">
        <div className="flex items-center gap-2 mb-2">
          <RandomMenu
            onRandomize={(mode) => store.getState().randomizePipeline(mode)}
            disabled={isGenerating}
            variant="desktop"
          />
          <GenerateMenu
            onGenerate={generate}
            onPreset={(preset) => { handleLoadPreset(preset); generate(); }}
            disabled={isGenerating}
            variant="desktop"
          />
        </div>
      </div>
    </div>
  );
}
