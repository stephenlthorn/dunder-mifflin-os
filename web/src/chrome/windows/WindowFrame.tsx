// A draggable, closable OS window (non-modal dialog). On phones (`sheet`) it fills the desktop and doesn't drag.
import { type ReactNode, type PointerEvent, useEffect, useRef } from 'react';
import type { WindowInfo } from './windowState';

type Props = {
  win: WindowInfo;
  title: string;
  subtitle?: string;
  onFocus: () => void;
  onClose: () => void;
  onMinimize: () => void;
  onMove: (x: number, y: number) => void;
  sheet?: boolean;
  size?: 'wide' | 'xl'; // the minutes memo, the calendar
  children: ReactNode;
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function WindowFrame({ win, title, subtitle, onFocus, onClose, onMinimize, onMove, sheet = false, size, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);
  const titleId = `${win.id.replace(/[^a-z0-9-]/gi, '-')}-title`;

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  const onDown = (e: PointerEvent<HTMLDivElement>) => {
    if (sheet || (e.target as HTMLElement).closest('button')) return;
    drag.current = { dx: e.clientX - win.x, dy: e.clientY - win.y };
    e.currentTarget.setPointerCapture(e.pointerId);
    onFocus();
  };
  const onDrag = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const maxX = window.innerWidth - 120;
    const maxY = window.innerHeight - 80;
    onMove(clamp(e.clientX - drag.current.dx, -200, maxX), clamp(e.clientY - drag.current.dy, 40, maxY));
  };
  const onUp = (e: PointerEvent<HTMLDivElement>) => {
    drag.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  return (
    <div
      ref={ref}
      role="dialog"
      aria-labelledby={titleId}
      tabIndex={-1}
      className={sheet ? 'window is-sheet' : size ? `window window-${size}` : 'window'}
      data-window={win.id}
      style={{ ...(sheet ? {} : { left: win.x, top: win.y }), zIndex: 100 + win.z, display: win.minimized ? 'none' : undefined }}
      onPointerDownCapture={onFocus}
    >
      <div className="window-bar" onPointerDown={onDown} onPointerMove={onDrag} onPointerUp={onUp}>
        <div className="window-titles">
          <h2 id={titleId}>{title}</h2>
          {subtitle && <span className="window-sub">{subtitle}</span>}
        </div>
        <button type="button" className="win-btn" aria-label={`Minimise ${title}`} onClick={onMinimize}>–</button>
        <button type="button" className="win-btn win-close" aria-label={`Close ${title}`} onClick={onClose}>×</button>
      </div>
      <div className="window-body">{children}</div>
    </div>
  );
}
