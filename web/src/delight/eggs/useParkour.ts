// "Parkour!" when you drag-pan the map fast: pointer handlers for the map's wrapper (they only listen; panning is
// usePanZoom's job). At most once every 30 seconds, never in Toby mode.
import { type PointerEvent, useMemo, useRef } from 'react';
import type { OfficeSnapshot } from '@shared/contract';
import { useDelight } from '../DelightContext';
import { PARKOUR_PX_PER_MS, type PanSample, panSpeed, parkourLine, trackPan } from './parkour';

const GAP_MS = 30_000;

export function useParkour(snapshot: OfficeSnapshot) {
  const { mode, toast } = useDelight();
  const samples = useRef<PanSample[]>([]);
  const last = useRef(-Infinity);
  const latest = useRef(snapshot);
  latest.current = snapshot;
  return useMemo(() => {
    if (!mode.eggs) return {};
    return {
      onPointerDown: () => { samples.current = []; },
      onPointerMove: (e: PointerEvent) => {
        if (!(e.buttons & 1)) return;
        samples.current = trackPan(samples.current, { t: e.timeStamp, x: e.clientX, y: e.clientY });
        if (panSpeed(samples.current) < PARKOUR_PX_PER_MS || e.timeStamp - last.current < GAP_MS) return;
        last.current = e.timeStamp;
        toast(parkourLine(latest.current));
      },
    };
  }, [mode.eggs, toast]);
}
