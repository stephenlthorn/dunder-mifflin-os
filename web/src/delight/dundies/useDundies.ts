// Loads what the Dundies count: every bot's last 7 days of timeline and the 7-day ledger, refreshed every 10 minutes,
// and recomputes the digest whenever the office changes (cards, jobs and errors come straight from the snapshot).
// A bot whose timeline can't be read (no timeline from its adapter, the demo day, a network error) is counted from
// the snapshot instead. Demo mode makes its timelines up locally (demoObservability.ts), like the Timeline tab.
import { useEffect, useMemo, useState } from 'react';
import type { OfficeSnapshot } from '@shared/contract';
import type { TimelineResponse, UsageReport } from '@shared/observability';
import { fetchTimeline, fetchUsage } from '../../data/observabilityApi';
import { demoTimeline, demoUsage } from '../../observability/demoObservability';
import type { DundiesState } from '../DelightContext';
import { computeDundies } from './awards';
import { WEEK_MS, botWeeks, weekWindow } from './signals';

const REFRESH_MS = 10 * 60_000;
const LIMIT = 1000;
type Sources = { timelines: Record<string, TimelineResponse | undefined>; usage: UsageReport | null };

async function load(ids: readonly string[], now: number, signal: AbortSignal): Promise<Sources> {
  const since = new Date(now - WEEK_MS).toISOString();
  const settled = await Promise.allSettled(ids.map((id) => fetchTimeline(id, { since, limit: LIMIT }, signal)));
  const timelines = Object.fromEntries(ids.map((id, i) => [id, settled[i]?.status === 'fulfilled' ? settled[i].value : undefined]));
  const usage = await fetchUsage('7d', signal).catch(() => null);
  return { timelines, usage };
}

function demoSources(snapshot: OfficeSnapshot, ids: readonly string[]): Sources {
  return { timelines: Object.fromEntries(ids.map((id) => [id, demoTimeline(snapshot, id)])), usage: demoUsage(snapshot, '7d') };
}

export function useDundies(snapshot: OfficeSnapshot | null, opts: { demo: boolean; enabled: boolean; now: () => number }): DundiesState {
  const [sources, setSources] = useState<Sources | null>(null);
  const [tick, setTick] = useState(0);
  const ids = useMemo(() => (snapshot ? snapshot.people.filter((p) => p.bot).map((p) => p.id) : []), [snapshot]);
  const idKey = ids.join(',');
  const ready = snapshot !== null;

  useEffect(() => {
    if (!ready || !opts.enabled || !snapshot) return undefined;
    if (opts.demo) {
      setSources(demoSources(snapshot, ids));
      return undefined;
    }
    const ctrl = new AbortController();
    load(ids, opts.now(), ctrl.signal).then((s) => { if (!ctrl.signal.aborted) setSources(s); }, () => undefined);
    const timer = setInterval(() => setTick((t) => t + 1), REFRESH_MS);
    return () => { ctrl.abort(); clearInterval(timer); };
  // the snapshot itself changes all the time; reload on new bots, the mode or the refresh tick only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, idKey, opts.demo, opts.enabled, tick]);

  return useMemo<DundiesState>(() => {
    if (!snapshot || !opts.enabled || !sources) return { phase: 'loading' };
    const w = weekWindow(opts.now());
    return { phase: 'ready', digest: computeDundies(botWeeks(snapshot, sources.timelines, sources.usage, w), w) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, sources, opts.enabled]);
}
