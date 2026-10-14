// GET /api/people/:id/timeline and GET /api/usage, validated (observabilityGuards.ts). 401 = sign in again.
import type { TimelineResponse, UsagePeriod, UsageReport } from '@shared/observability';
import { SignInRequiredError } from './api';
import { parseTimeline, parseUsageReport } from './observabilityGuards';

async function getJson(path: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(path, { signal, headers: { accept: 'application/json' } });
  if (res.status === 401) throw new SignInRequiredError();
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const error = typeof body === 'object' && body && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : `Request failed (${res.status})`;
    throw new Error(error);
  }
  return body;
}

export async function fetchTimeline(personId: string, opts: { since: string; limit: number }, signal?: AbortSignal): Promise<TimelineResponse> {
  const q = new URLSearchParams({ since: opts.since, limit: String(opts.limit) });
  const t = parseTimeline(await getJson(`/api/people/${encodeURIComponent(personId)}/timeline?${q}`, signal));
  if (!t) throw new Error('The server sent a timeline this page cannot read');
  return t;
}

export async function fetchUsage(period: UsagePeriod, signal?: AbortSignal): Promise<UsageReport> {
  const r = parseUsageReport(await getJson(`/api/usage?period=${encodeURIComponent(period)}`, signal));
  if (!r) throw new Error('The server sent a usage report this page cannot read');
  return r;
}
