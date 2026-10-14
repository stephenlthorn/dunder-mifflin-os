// Drag to pan, wheel / buttons to zoom, "fit" to frame the whole office, and smooth camera glides (flyTo).
// Click suppression after a drag.
import { type PointerEvent as ReactPointerEvent, type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import type { Bounds } from '../iso/projection';
import { type View, fitView, interpolateView, panBy, zoomAt } from './viewport';

const DRAG_THRESHOLD = 4;
const FLY_MS = 520;

export type Size = { w: number; h: number };
/** Where the camera should end up, given the viewport size and the view it starts from. */
export type CameraTarget = (size: Size, from: View) => View;
export type FlyOptions = { instant?: boolean; onDone?: () => void };

export function usePanZoom(ref: RefObject<HTMLElement | null>, content: Bounds) {
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const touched = useRef(false);
  const drag = useRef<{ x: number; y: number; id: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const anim = useRef<number | null>(null);

  const size = (): Size => {
    const el = ref.current;
    return { w: el?.clientWidth || window.innerWidth, h: el?.clientHeight || window.innerHeight };
  };
  const stopGlide = () => {
    if (anim.current !== null) cancelAnimationFrame(anim.current);
    anim.current = null;
  };

  const fit = useCallback(() => {
    stopGlide();
    touched.current = false;
    setView(fitView(content, size(), 16));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content]);

  useEffect(() => {
    fit();
    const onResize = () => { if (!touched.current) fit(); };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      stopGlide();
    };
  }, [fit]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      stopGlide();
      touched.current = true;
      const r = el.getBoundingClientRect();
      const factor = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015));
      setView((v) => zoomAt(v, factor, { x: e.clientX - r.left, y: e.clientY - r.top }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [ref]);

  const zoomBy = useCallback((factor: number) => {
    stopGlide();
    touched.current = true;
    const { w, h } = size();
    setView((v) => zoomAt(v, factor, { x: w / 2, y: h / 2 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Glide (or jump, when `instant`) to a target view; `onDone` runs after the final frame is on screen. */
  const flyTo = useCallback((target: CameraTarget, { instant = false, onDone }: FlyOptions = {}) => {
    stopGlide();
    touched.current = true;
    const sz = size();
    const done = () => { if (onDone) requestAnimationFrame(() => onDone()); };
    if (instant) {
      setView((prev) => target(sz, prev));
      done();
      return;
    }
    let start: number | null = null;
    let from: View | null = null;
    let to: View | null = null;
    const step = (now: number) => {
      start ??= now;
      const t = Math.min(1, (now - start) / FLY_MS);
      setView((prev) => {
        if (!from || !to) {
          from = prev;
          to = target(sz, prev);
        }
        return interpolateView(from, to, t, sz);
      });
      if (t < 1) anim.current = requestAnimationFrame(step);
      else {
        anim.current = null;
        done();
      }
    };
    anim.current = requestAnimationFrame(step);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    stopGlide();
    drag.current = { x: e.clientX, y: e.clientY, id: e.pointerId, moved: false };
    suppressClick.current = false;
  };
  const onPointerMove = (e: ReactPointerEvent) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved) (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    d.moved = true;
    touched.current = true;
    drag.current = { ...d, x: e.clientX, y: e.clientY, moved: true };
    setView((v) => panBy(v, dx, dy));
  };
  const onPointerUp = (e: ReactPointerEvent) => {
    if (drag.current?.moved) suppressClick.current = true;
    drag.current = null;
    (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
  };
  const onClickCapture = (e: React.MouseEvent) => {
    if (suppressClick.current) {
      e.stopPropagation();
      e.preventDefault();
      suppressClick.current = false;
    }
  };

  return { view, fit, zoomBy, flyTo, handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onClickCapture } };
}
