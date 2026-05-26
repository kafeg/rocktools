import { useState, useRef, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";

interface Props {
  text: string;
  children: ReactNode;
  position?: "top" | "bottom" | "left" | "right";
  delay?: number;
}

export default function Tooltip({ text, children, position = "top", delay = 400 }: Props) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const timeout = useRef<ReturnType<typeof setTimeout>>();
  const triggerRef = useRef<HTMLDivElement>(null);

  const show = useCallback(() => {
    timeout.current = setTimeout(() => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      let top = 0, left = 0;
      switch (position) {
        case "top":
          top = rect.top - 4;
          left = rect.left + rect.width / 2;
          break;
        case "bottom":
          top = rect.bottom + 4;
          left = rect.left + rect.width / 2;
          break;
        case "left":
          top = rect.top + rect.height / 2;
          left = rect.left - 4;
          break;
        case "right":
          top = rect.top + rect.height / 2;
          left = rect.right + 4;
          break;
      }
      setCoords({ top, left });
      setVisible(true);
    }, delay);
  }, [delay, position]);

  const hide = useCallback(() => {
    clearTimeout(timeout.current);
    setVisible(false);
  }, []);

  const transformMap = {
    top: "translate(-50%, -100%)",
    bottom: "translate(-50%, 0)",
    left: "translate(-100%, -50%)",
    right: "translate(0, -50%)",
  };

  return (
    <div ref={triggerRef} className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && createPortal(
        <div
          style={{ position: "fixed", top: coords.top, left: coords.left, transform: transformMap[position] }}
          className="z-[9999] px-2 py-1 rounded text-[10px] leading-tight
                     bg-space-bg border border-space-border text-space-text
                     shadow-lg shadow-black/40 whitespace-nowrap pointer-events-none"
        >
          {text}
        </div>,
        document.body,
      )}
    </div>
  );
}
