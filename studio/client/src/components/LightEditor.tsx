import { useStudioStore, type LightSource } from "../stores/useStudioStore";

const TYPE_ICONS: Record<string, string> = {
  directional: "D",
  point: "P",
  ambient: "A",
};

interface Props {
  light: LightSource;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export default function LightEditor({ light, collapsed, onToggleCollapse }: Props) {
  const { updateLight, toggleLight, removeLight } = useStudioStore();

  return (
    <div className={`border rounded-lg overflow-hidden ${light.enabled ? "border-space-border/40" : "border-space-border/20 opacity-50"}`}>
      <div
        className="flex items-center justify-between px-2 py-1.5 bg-space-panel/50 cursor-pointer select-none"
        onClick={onToggleCollapse}
      >
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={light.enabled}
            onChange={(e) => { e.stopPropagation(); toggleLight(light.id); }}
            onClick={(e) => e.stopPropagation()}
            className="w-3 h-3 accent-space-accent"
          />
          <span className="text-[10px] font-mono text-space-dim/60 w-3">{TYPE_ICONS[light.type]}</span>
          <input
            type="color"
            value={light.color}
            onChange={(e) => { e.stopPropagation(); updateLight(light.id, { color: e.target.value }); }}
            onClick={(e) => e.stopPropagation()}
            className="w-4 h-4 rounded border-0 cursor-pointer bg-transparent"
          />
          <span className="text-xs text-space-text">{light.id}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-space-dim/50">{light.intensity.toFixed(1)}</span>
          <button
            onClick={(e) => { e.stopPropagation(); removeLight(light.id); }}
            className="text-space-dim/40 hover:text-space-danger text-xs px-1"
          >
            x
          </button>
          <span className="text-space-dim/40 text-[10px]">{collapsed ? "+" : "-"}</span>
        </div>
      </div>

      {!collapsed && (
        <div className="px-3 py-2 space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-16 text-space-dim shrink-0">Type</span>
            <select
              value={light.type}
              onChange={(e) => updateLight(light.id, { type: e.target.value as LightSource["type"] })}
              className="flex-1 bg-space-bg border border-space-border rounded px-1.5 py-0.5 text-space-text text-xs"
            >
              <option value="directional">Directional</option>
              <option value="point">Point</option>
              <option value="ambient">Ambient</option>
            </select>
          </div>

          <SliderRow label="Intensity" value={light.intensity} min={0} max={10} step={0.1}
            onChange={(v) => updateLight(light.id, { intensity: v })} />

          {light.type !== "ambient" && (
            <>
              <SliderRow label="Azimuth" value={light.azimuth} min={0} max={360} step={1}
                onChange={(v) => updateLight(light.id, { azimuth: v })} />
              <SliderRow label="Elevation" value={light.elevation} min={-90} max={90} step={1}
                onChange={(v) => updateLight(light.id, { elevation: v })} />
              <SliderRow label="Distance" value={light.distance} min={0.5} max={50} step={0.1}
                onChange={(v) => updateLight(light.id, { distance: v })} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SliderRow({ label, value, min, max, step, onChange }: {
  label: string; value: number; min: number; max: number; step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 text-space-dim shrink-0">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 accent-space-accent" />
      <span className="w-10 text-right text-space-dim/60 font-mono text-[10px]">
        {Number.isInteger(step) ? value.toFixed(0) : value.toFixed(1)}
      </span>
    </div>
  );
}
