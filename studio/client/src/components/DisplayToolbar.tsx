import { useStudioStore } from "../stores/useStudioStore";
import Tooltip from "./Tooltip";

export default function DisplayToolbar() {
  const wireframe = useStudioStore((s) => s.wireframe);
  const autoRotate = useStudioStore((s) => s.autoRotate);
  const showGrid = useStudioStore((s) => s.showGrid);
  const instantGenerate = useStudioStore((s) => s.instantGenerate);
  const autoLoadOnStart = useStudioStore((s) => s.autoLoadOnStart);
  const { setWireframe, setAutoRotate, setShowGrid, setInstantGenerate, setAutoLoadOnStart } = useStudioStore();

  const icon = "w-7 h-7 flex items-center justify-center rounded transition-colors cursor-pointer";
  const iconOn = "text-space-accent bg-space-accent/15";
  const iconOff = "text-space-dim/50 hover:text-space-dim";

  const chk = "flex items-center gap-1.5 cursor-pointer";
  const chkOn = "text-space-accent";
  const chkOff = "text-space-dim/60";

  return (
    <div className="flex flex-col md:flex-row items-end md:items-center gap-1 md:gap-1.5 px-2 py-1 rounded-lg bg-space-panel/90 backdrop-blur-md
                    border border-space-border shadow-lg pointer-events-auto">
      <div className="flex items-center gap-1.5">
        <Tooltip text="Wireframe" position="top" delay={300}>
          <button
            onClick={() => setWireframe(!wireframe)}
            className={`${icon} ${wireframe ? iconOn : iconOff}`}
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.2">
              <rect x="2" y="2" width="12" height="12" />
              <line x1="2" y1="8" x2="14" y2="8" />
              <line x1="8" y1="2" x2="8" y2="14" />
            </svg>
          </button>
        </Tooltip>

        <Tooltip text="Auto-rotate" position="top" delay={300}>
          <button
            onClick={() => setAutoRotate(!autoRotate)}
            className={`${icon} ${autoRotate ? iconOn : iconOff}`}
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.2">
              <path d="M12 4A5.5 5.5 0 0 0 3.5 8" />
              <path d="M4 12A5.5 5.5 0 0 0 12.5 8" />
              <polyline points="12,1 12,4 9,4" />
              <polyline points="4,15 4,12 7,12" />
            </svg>
          </button>
        </Tooltip>

        <Tooltip text="Grid" position="top" delay={300}>
          <button
            onClick={() => setShowGrid(!showGrid)}
            className={`${icon} ${showGrid ? iconOn : iconOff}`}
          >
            <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.0" opacity="0.9">
              <line x1="1" y1="5" x2="15" y2="5" />
              <line x1="1" y1="11" x2="15" y2="11" />
              <line x1="5" y1="1" x2="5" y2="15" />
              <line x1="11" y1="1" x2="11" y2="15" />
            </svg>
          </button>
        </Tooltip>
      </div>

      <div className="hidden md:block w-px h-5 bg-space-border/50 mx-0.5" />

      <div className="flex items-center gap-1.5">
        <Tooltip text="Auto-regenerate mesh when parameters change" position="top" delay={300}>
          <label className={`${chk} ${instantGenerate ? chkOn : chkOff}`}>
            <input
              type="checkbox"
              checked={instantGenerate}
              onChange={(e) => setInstantGenerate(e.target.checked)}
              className="w-3 h-3 rounded border-space-border accent-current"
            />
            <span className="text-[10px] select-none whitespace-nowrap">Instant</span>
          </label>
        </Tooltip>

        <Tooltip text="Auto-load last asteroid or generate random on startup" position="top" delay={300}>
          <label className={`${chk} ${autoLoadOnStart ? chkOn : chkOff}`}>
            <input
              type="checkbox"
              checked={autoLoadOnStart}
              onChange={(e) => setAutoLoadOnStart(e.target.checked)}
              className="w-3 h-3 rounded border-space-border accent-current"
            />
            <span className="text-[10px] select-none whitespace-nowrap">Auto-load</span>
          </label>
        </Tooltip>
      </div>
    </div>
  );
}
