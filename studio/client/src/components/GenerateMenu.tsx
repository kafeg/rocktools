import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { FULL_PRESETS, type FullPreset } from "../stores/useStudioStore";

interface Props {
  onGenerate: () => void;
  onPreset: (preset: FullPreset) => void;
  disabled?: boolean;
  variant: "desktop" | "mobile";
}

export default function GenerateMenu({ onGenerate, onPreset, disabled, variant }: Props) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ bottom: 0, left: 0, maxW: 320 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const openMenu = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const maxW = Math.min(320, window.innerWidth - 16);
    setPos({
      bottom: window.innerHeight - rect.top + 4,
      left: Math.min(rect.left, window.innerWidth - maxW - 8),
      maxW,
    });
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

  function handlePick(preset: FullPreset) {
    setOpen(false);
    onPreset(preset);
  }

  const isMobile = variant === "mobile";

  return (
    <>
      <div
        ref={triggerRef}
        className={isMobile
          ? "flex-[2] flex rounded-xl overflow-hidden"
          : "flex-1 flex rounded overflow-hidden"
        }
      >
        <button
          onClick={onGenerate}
          disabled={disabled}
          className={isMobile
            ? `flex-1 py-3 text-sm font-semibold transition-all
               bg-space-accent text-white active:bg-space-accent/70
               disabled:opacity-40 pl-3 pr-1`
            : `flex-1 py-2 text-sm font-medium transition-all
               bg-space-accent hover:bg-space-accent/80 text-white
               disabled:opacity-40 disabled:cursor-not-allowed`
          }
        >
          {disabled ? "Generating..." : "Generate"}
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); if (open) setOpen(false); else openMenu(); }}
          disabled={disabled}
          className={isMobile
            ? `w-8 flex items-center justify-center transition-all
               bg-space-accent text-white active:bg-space-accent/70
               disabled:opacity-40 border-l border-white/20`
            : `w-7 flex items-center justify-center transition-all
               bg-space-accent hover:bg-space-accent/80 text-white
               disabled:opacity-40 disabled:cursor-not-allowed border-l border-white/20`
          }
        >
          <svg viewBox="0 0 10 6" className="w-2.5 h-2.5" fill="currentColor"><path d="M0 0l5 6 5-6z"/></svg>
        </button>
      </div>

      {open && createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            bottom: pos.bottom,
            left: pos.left,
            maxWidth: pos.maxW,
          }}
          className="z-[9999] min-w-[200px] py-1 rounded-lg
                     bg-space-panel border border-space-border
                     shadow-xl shadow-black/50 backdrop-blur-md"
        >
          <div className="px-3 py-1.5 text-[9px] uppercase tracking-wider text-space-dim">
            Load Preset & Generate
          </div>
          {FULL_PRESETS.map((p) => (
            <button
              key={p.name}
              onClick={() => handlePick(p)}
              className="w-full text-left px-3 py-2 text-[11px]
                         hover:bg-space-accent/15 transition-colors flex items-baseline gap-2
                         text-space-text active:bg-space-accent/25"
            >
              <span className="font-medium shrink-0">{p.name}</span>
              <span className="text-[9px] text-space-dim truncate">{p.description}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
