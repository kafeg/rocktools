import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { FULL_PRESETS, type RandomMode } from "../stores/useStudioStore";

interface MenuItem {
  mode: RandomMode;
  label: string;
  desc?: string;
}

const MENU_ITEMS: (MenuItem | "sep")[] = [
  { mode: "full", label: "Full Random", desc: "Random everything" },
  { mode: "any-preset", label: "Any Preset", desc: "Random preset variation" },
  "sep",
  ...FULL_PRESETS.map((p) => ({
    mode: p.name.split(" ")[0]! as RandomMode,
    label: p.name,
  })),
];

const MODE_LABELS: Record<RandomMode, string> = {
  "full": "Random",
  "any-preset": "Preset",
  "M-type": "M-type",
  "C-type": "C-type",
  "S-type": "S-type",
  "Ice": "Ice",
  "Dwarf": "Dwarf",
  "Rubble": "Rubble",
  "Comet": "Comet",
  "Shard": "Shard",
};

interface Props {
  onRandomize: (mode: RandomMode) => void;
  disabled?: boolean;
  variant: "desktop" | "mobile";
}

export default function RandomMenu({ onRandomize, disabled, variant }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ bottom: 0, left: 0 });
  const [selectedMode, setSelectedMode] = useState<RandomMode>("full");
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setPos({ bottom: window.innerHeight - rect.top + 4, left: rect.left });
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const onClick = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      if (triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const raf = requestAnimationFrame(() => {
      document.addEventListener("click", onClick, true);
      document.addEventListener("keydown", onKey);
    });
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function handlePick(mode: RandomMode) {
    setOpen(false);
    setSelectedMode(mode);
    onRandomize(mode);
  }

  function handleMainClick() {
    onRandomize(selectedMode);
  }

  const isMobile = variant === "mobile";
  const label = MODE_LABELS[selectedMode];

  return (
    <>
      <div
        ref={triggerRef}
        className={isMobile
          ? "flex-1 flex rounded-xl overflow-hidden"
          : "flex rounded overflow-hidden"
        }
      >
        <button
          onClick={handleMainClick}
          disabled={disabled}
          className={isMobile
            ? "flex-1 py-3 text-sm font-semibold transition-all bg-space-warm/20 text-space-warm active:bg-space-warm/40 disabled:opacity-40 pl-3 pr-2"
            : "px-3 py-2 text-sm font-medium transition-all bg-space-warm/20 text-space-warm hover:bg-space-warm/30"
          }
        >
          {label}
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          disabled={disabled}
          className={isMobile
            ? "w-7 flex items-center justify-center transition-all bg-space-warm/20 text-space-warm active:bg-space-warm/40 disabled:opacity-40 border-l border-space-warm/20"
            : "w-6 flex items-center justify-center transition-all bg-space-warm/20 text-space-warm hover:bg-space-warm/30 border-l border-space-warm/20"
          }
        >
          <svg viewBox="0 0 10 6" className="w-3 h-3" fill="currentColor"><path d="M0 0l5 6 5-6z"/></svg>
        </button>
      </div>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{ position: "fixed", bottom: pos.bottom, left: pos.left }}
          className="z-[9999] min-w-[190px] py-1 rounded-lg
                     bg-space-panel border border-space-border
                     shadow-xl shadow-black/50 backdrop-blur-md"
        >
          {MENU_ITEMS.map((item, i) =>
            item === "sep" ? (
              <div key={i} className="my-1 border-t border-space-border/50" />
            ) : (
              <button
                key={item.mode}
                onClick={() => handlePick(item.mode)}
                className={`w-full text-left px-3 py-1.5 text-[11px]
                           hover:bg-space-warm/15 transition-colors flex items-baseline gap-2
                           ${item.mode === selectedMode ? "text-space-warm" : "text-space-text"}`}
              >
                <span>{item.label}</span>
                {item.desc && (
                  <span className="text-[9px] text-space-dim">{item.desc}</span>
                )}
              </button>
            ),
          )}
        </div>,
        document.body,
      )}
    </>
  );
}
