// A right-click menu, drawn like the menu bar's popups.
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';

export interface ContextMenuItem {
  label: string;
  action: () => void;
  enabled?: boolean;
  testId?: string;
}

interface Open {
  x: number;
  y: number;
  items: ContextMenuItem[];
}

/** Returns the menu element (render it once) and a function to open it from an onContextMenu handler. */
export function useContextMenu(): [ReactNode, (e: ReactMouseEvent, items: ContextMenuItem[]) => void] {
  const [open, setOpen] = useState<Open | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(null);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    window.addEventListener('blur', () => setOpen(null), { once: true });
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  const show = (e: ReactMouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault();
    e.stopPropagation();
    // Keep the menu inside the window.
    const x = Math.min(e.clientX, window.innerWidth - 250);
    const y = Math.min(e.clientY, window.innerHeight - items.length * 28 - 16);
    setOpen({ x, y, items });
  };

  const menu = open ? (
    <div ref={ref} className="menu-popup context-menu" role="menu" style={{ position: 'fixed', left: open.x, top: open.y }} data-testid="context-menu">
      {open.items.map((item, i) => (
        <button
          key={i}
          className="menu-entry"
          role="menuitem"
          data-testid={item.testId}
          disabled={item.enabled === false}
          onClick={() => {
            setOpen(null);
            item.action();
          }}
        >
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  ) : null;
  return [menu, show];
}
