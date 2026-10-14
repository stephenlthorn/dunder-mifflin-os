// While the office is the demo day, keep its clock: read GET /api/demo/clock, re-sync now and then (someone else may
// change the speed), and change the speed with POST /api/demo/clock. The same calls work against the server
// (`npx dunder-mifflin-os --demo`) and the static demo, whose in-browser office answers them.
import { useCallback, useEffect, useState } from 'react';
import type { OfficeSnapshot } from '@shared/contract';
import type { DemoClock, DemoClockView } from '@shared/demo/clock';
import type { DemoSpeed } from '@shared/demo/time';
import { clockFromView, isDemoDay, parseClockView } from './demoClock';

export type DemoDay = {
  readonly view: DemoClockView;
  readonly clock: DemoClock;
  readonly error: string | null;
  setSpeed(speed: DemoSpeed): void;
};

const SYNC_MS = 15_000;
const URL_CLOCK = '/api/demo/clock';

async function requestClock(init?: RequestInit): Promise<DemoClockView> {
  const res = await fetch(URL_CLOCK, { ...init, headers: { accept: 'application/json', ...(init?.body ? { 'content-type': 'application/json' } : {}) } });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) throw new Error(typeof (body as { error?: unknown } | null)?.error === 'string' ? (body as { error: string }).error : `Clock request failed (${res.status})`);
  const view = parseClockView(body);
  if (!view) throw new Error('The demo clock answered something unexpected');
  return view;
}

export function useDemoClock(snapshot: OfficeSnapshot | null): DemoDay | null {
  const active = isDemoDay(snapshot);
  const [state, setState] = useState<{ view: DemoClockView; clock: DemoClock } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((view: DemoClockView) => {
    setState({ view, clock: clockFromView(view, Date.now()) });
    setError(null);
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    let live = true;
    const sync = () => requestClock().then((v) => { if (live) apply(v); }, (e: Error) => { if (live) setError(e.message); });
    void sync();
    const timer = setInterval(() => void sync(), SYNC_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [active, apply]);

  const setSpeed = useCallback((speed: DemoSpeed) => {
    requestClock({ method: 'POST', body: JSON.stringify({ speed }) }).then(apply, (e: Error) => setError(e.message));
  }, [apply]);

  return active && state ? { ...state, error, setSpeed } : null;
}
