// Loads a person's timeline and the ledger: from the server when live (refreshing every minute while shown), or
// made up locally in demo mode (demoObservability.ts).
import { useCallback, useEffect, useState } from 'react';
import type { OfficeSnapshot } from '@shared/contract';
import type { TimelineResponse, UsagePeriod, UsageReport } from '@shared/observability';
import { SignInRequiredError } from '../data/api';
import { fetchTimeline, fetchUsage } from '../data/observabilityApi';
import { demoTimeline, demoUsage } from './demoObservability';

export type Loaded<T> = { phase: 'loading' } | { phase: 'ready'; data: T } | { phase: 'error'; error: string };
export type TimelineRange = '24h' | '7d';

const REFRESH_MS = 60_000;
const LIMIT = 1000;
const RANGE_MS: Record<TimelineRange, number> = { '24h': 86_400_000, '7d': 7 * 86_400_000 };

const message = (e: unknown) => (e instanceof SignInRequiredError ? 'Sign in again to see this.' : e instanceof Error ? e.message : 'Could not load this.');

function useLoader<T>(load: (signal: AbortSignal) => Promise<T>, key: string): Loaded<T> & { reload: () => void } {
  const [state, setState] = useState<Loaded<T>>({ phase: 'loading' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal).then(
      (data) => { if (!ctrl.signal.aborted) setState({ phase: 'ready', data }); },
      (e: unknown) => { if (!ctrl.signal.aborted) setState({ phase: 'error', error: message(e) }); },
    );
    const timer = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => { ctrl.abort(); clearInterval(timer); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { ...state, reload };
}

export function useTimeline(personId: string, range: TimelineRange, ctx: { demo: boolean; snapshot: OfficeSnapshot }) {
  return useLoader<TimelineResponse>(async (signal) => {
    if (ctx.demo) {
      const t = demoTimeline(ctx.snapshot, personId);
      const since = Date.parse(ctx.snapshot.generatedAt) - RANGE_MS[range];
      return { ...t, events: t.events.filter((e) => Date.parse(e.at) >= since) };
    }
    return fetchTimeline(personId, { since: new Date(Date.now() - RANGE_MS[range]).toISOString(), limit: LIMIT }, signal);
  }, `${personId}|${range}|${ctx.demo}`);
}

export function useUsage(period: UsagePeriod, ctx: { demo: boolean; snapshot: OfficeSnapshot }) {
  return useLoader<UsageReport>(async (signal) => (ctx.demo ? demoUsage(ctx.snapshot, period) : fetchUsage(period, signal)), `${period}|${ctx.demo}`);
}
