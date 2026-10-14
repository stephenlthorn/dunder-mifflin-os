// "Parkour!": a toast when you drag-pan the map fast. Measures the pointer's speed over the last 150 ms.
import type { OfficeSnapshot } from '@shared/contract';
import { fleetCounts } from '../../office/status';
import type { Toast } from './twss';

export type PanSample = { t: number; x: number; y: number };

export const PARKOUR_PX_PER_MS = 2.5; // 2500 px a second: a flick, not a pan
const WINDOW_MS = 150;

export const trackPan = (samples: readonly PanSample[], next: PanSample): PanSample[] =>
  [...samples.filter((s) => next.t - s.t <= WINDOW_MS), next];

export function panSpeed(samples: readonly PanSample[]): number {
  const last = samples[samples.length - 1];
  const first = last ? samples.find((s) => last.t - s.t <= WINDOW_MS) : undefined;
  if (!last || !first || last.t === first.t) return 0;
  return Math.hypot(last.x - first.x, last.y - first.y) / (last.t - first.t);
}

/** The toast: the fleet you just flew over. */
export function parkourLine(s: OfficeSnapshot): Toast {
  const c = fleetCounts(s.people, s.presence);
  const parts = ([[c.working, 'working'], [c.meeting, 'in a meeting'], [c['needs-input'], 'needing you'], [c.error, 'with an error'], [c.idle, 'idle']] as const)
    .filter(([n]) => n > 0).map(([n, w]) => `${n} ${w}`);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : (parts[0] ?? 'an empty office');
  return { text: 'Parkour!', sub: `Hardcore parkour over ${list}.` };
}
