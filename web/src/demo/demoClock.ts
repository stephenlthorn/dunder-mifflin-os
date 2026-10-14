// The demo day's clock in the browser: validate what GET /api/demo/clock answers, keep office time ticking locally
// between syncs (shared/demo/clock.ts), and show it as office time (UTC, so it reads the same everywhere). Pure.
import type { OfficeSnapshot } from '@shared/contract';
import { type DemoClock, type DemoClockView, minuteAt } from '@shared/demo/clock';
import { isoAt, parseSpeed } from '@shared/demo/time';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown, max = 80): v is string => typeof v === 'string' && v.length > 0 && v.length <= max;
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

export function parseClockView(raw: unknown): DemoClockView | null {
  if (!isObj(raw)) return null;
  const speed = parseSpeed(raw.speed);
  const speeds = Array.isArray(raw.speeds) ? raw.speeds.map(parseSpeed) : [];
  if (speed === null || speeds.length === 0 || speeds.some((s) => s === null)) return null;
  if (!isStr(raw.title) || !isStr(raw.time, 40) || Number.isNaN(Date.parse(raw.time)) || !isStr(raw.start, 5) || !isStr(raw.end, 5)) return null;
  if (!isCount(raw.offsetMs) || !isCount(raw.day)) return null;
  return {
    title: raw.title, speed, speeds: speeds as DemoClockView['speeds'], time: raw.time, offsetMs: raw.offsetMs, day: raw.day, start: raw.start, end: raw.end,
  };
}

/** A local clock that agrees with the server's from the moment its answer arrived. */
export function clockFromView(view: DemoClockView, receivedAtMs: number): DemoClock {
  return { speed: view.speed, anchorRealMs: receivedAtMs, anchorSimMs: view.offsetMs };
}

/** Office time now, as epoch ms (for "5 min ago" in windows and the clock in the top bar). */
export const officeNowMs = (clock: DemoClock, realMs: number): number => Date.parse(isoAt(minuteAt(clock, realMs)));

export function formatOfficeTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' });
}

/** Is this office the demo day (a server or the static page running the demo adapter)? */
export const isDemoDay = (snapshot: OfficeSnapshot | null): boolean => snapshot?.adapters?.some((a) => a.kind === 'demo') === true;
