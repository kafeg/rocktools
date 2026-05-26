import { useState } from "react";
import { useStudioStore, SCENE_PRESETS } from "../stores/useStudioStore";
import LightEditor from "./LightEditor";
import BackgroundPicker from "./BackgroundPicker";
import ImageExportPanel from "./ImageExportPanel";
import Tooltip from "./Tooltip";

export default function ScenePanel() {
  const lights = useStudioStore((s) => s.lights);
  const { addLight, loadScenePreset } = useStudioStore();
  const [collapsedLights, setCollapsedLights] = useState<Record<string, boolean>>({});
  const [activePresetId, setActivePresetId] = useState<string | null>("space");

  function handlePreset(id: string) {
    const preset = SCENE_PRESETS.find((p) => p.id === id);
    if (preset) {
      loadScenePreset(preset);
      setActivePresetId(id);
    }
  }

  function handleLightChange() {
    setActivePresetId(null);
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-4">
      {/* Scene Presets */}
      <section>
        <h3 className="text-[10px] uppercase tracking-wider text-space-dim mb-2">Scene Presets</h3>
        <div className="flex flex-wrap gap-1">
          {SCENE_PRESETS.map((p) => (
            <Tooltip key={p.id} text={p.description} position="bottom" delay={300}>
              <button
                onClick={() => handlePreset(p.id)}
                className={`px-2 py-1 text-[10px] rounded transition-colors ${
                  activePresetId === p.id
                    ? "bg-space-accent/20 text-space-accent"
                    : "text-space-dim/60 hover:text-space-dim hover:bg-space-panel/50"
                }`}
              >
                {p.name}
              </button>
            </Tooltip>
          ))}
        </div>
      </section>

      {/* Background */}
      <section>
        <h3 className="text-[10px] uppercase tracking-wider text-space-dim mb-2">Background</h3>
        <BackgroundPicker />
      </section>

      {/* Lighting */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[10px] uppercase tracking-wider text-space-dim">Lighting</h3>
          <button
            onClick={() => { addLight(); handleLightChange(); }}
            disabled={lights.length >= 8}
            className="text-[10px] text-space-accent hover:text-space-accent/80 disabled:text-space-dim/30 disabled:cursor-not-allowed transition-colors"
          >
            + Add Light
          </button>
        </div>
        <div className="space-y-1.5">
          {lights.map((light) => (
            <LightEditor
              key={light.id}
              light={light}
              collapsed={collapsedLights[light.id] !== false}
              onToggleCollapse={() => {
                setCollapsedLights((prev) => ({ ...prev, [light.id]: prev[light.id] === false }));
                handleLightChange();
              }}
            />
          ))}
        </div>
      </section>

      {/* Image Export */}
      <section>
        <h3 className="text-[10px] uppercase tracking-wider text-space-dim mb-2">Image Export</h3>
        <ImageExportPanel />
      </section>
    </div>
  );
}
