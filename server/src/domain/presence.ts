// The status rule (docs/ARCHITECTURE.md, "Status"), as a pure function of one bot's inputs. Precedence:
//   offline  gateway not running/unreadable, no telegram platform, or platform not connected (unless it has an error code)
//   error    platform error_code, or a run crashed/timed out, or a scheduled job failed, in the last 60 min
//   meeting  a running run on a SHARED task (drawn in that task's room, default the Conference Room / ops)
//   working  a running run with a heartbeat (or start) < 5 min old, or session activity < 5 min
//   idle     otherwise (since = last activity)
import type { Presence } from '../../../shared/contract.ts';
import type { CronJob, EpochSeconds, PlatformState, SessionActivity } from '../hermes/types.ts';
import { scrubText } from './scrub.ts';

export const WORKING_WINDOW_S = 5 * 60;
export const ERROR_WINDOW_S = 60 * 60;
const ACTIVITY_MAX = 120;

const FAILED_RUN = new Set(['crashed', 'timed_out', 'spawn_failed', 'failed']);
const FAILED_CRON = new Set(['error', 'failed', 'crashed', 'timeout', 'timed_out']);

export type RunView = {
  readonly title: string;
  readonly status: string;
  readonly outcome: string | null;
  readonly startedAt: EpochSeconds;
  readonly endedAt: EpochSeconds | null;
  readonly lastHeartbeatAt: EpochSeconds | null;
  readonly shared: boolean;
  readonly roomId?: string;
};

export type PresenceInput = {
  readonly now: EpochSeconds;
  readonly gatewayRunning: boolean | null; // null = gateway status could not be read
  readonly platform: PlatformState | undefined;
  readonly runs: ReadonlyArray<RunView>;
  readonly session: SessionActivity | undefined;
  readonly cron: ReadonlyArray<CronJob>;
};

export function toIso(epochSeconds: EpochSeconds): string {
  return new Date(epochSeconds * 1000).toISOString();
}

function clip(text: string): string {
  const oneLine = scrubText(text).replace(/\s+/g, ' ').trim();
  return oneLine.length > ACTIVITY_MAX ? `${oneLine.slice(0, ACTIVITY_MAX - 1)}…` : oneLine;
}

function isoToEpoch(iso: string | null): EpochSeconds | null {
  const ms = iso ? Date.parse(iso) : Number.NaN;
  return Number.isFinite(ms) ? ms / 1000 : null;
}

function offline(input: PresenceInput): Presence | null {
  if (input.gatewayRunning === null) return { status: 'offline', activity: 'Gateway status unavailable' };
  if (!input.gatewayRunning) return { status: 'offline', activity: 'Gateway not running' };
  const p = input.platform;
  if (!p) return { status: 'offline', activity: 'No Telegram connection' };
  if (p.errorCode || p.state === 'connected') return null;
  return { status: 'offline', activity: clip(`Telegram ${p.state}`), ...(p.updatedAt ? { since: p.updatedAt } : {}) };
}

function failure(input: PresenceInput): Presence | null {
  const p = input.platform;
  if (p?.errorCode) return { status: 'error', activity: clip(`Telegram error: ${p.errorCode}`), ...(p.updatedAt ? { since: p.updatedAt } : {}) };
  const cutoff = input.now - ERROR_WINDOW_S;
  const crashed = input.runs
    .filter((r) => r.endedAt !== null && r.endedAt >= cutoff && (FAILED_RUN.has(r.status) || FAILED_RUN.has(r.outcome ?? '')))
    .sort((a, b) => (b.endedAt ?? 0) - (a.endedAt ?? 0))[0];
  if (crashed) {
    const verb = crashed.status === 'timed_out' || crashed.outcome === 'timed_out' ? 'timed out' : 'crashed';
    return { status: 'error', activity: clip(`Task ${verb}: ${crashed.title}`), since: toIso(crashed.endedAt ?? input.now) };
  }
  const job = input.cron.find((j) => {
    const at = isoToEpoch(j.lastRunAt);
    return at !== null && at >= cutoff && FAILED_CRON.has(j.lastStatus ?? '');
  });
  return job ? { status: 'error', activity: clip(`Scheduled job failed: ${job.name}`), ...(job.lastRunAt ? { since: job.lastRunAt } : {}) } : null;
}

const SOURCE_LABELS: Readonly<Record<string, string>> = {
  telegram: 'Chatting on Telegram', cron: 'Running a scheduled job', kanban: 'Working a kanban card', cli: 'Working in the terminal',
};

function work(input: PresenceInput): Presence | null {
  const running = input.runs.filter((r) => r.status === 'running' && r.endedAt === null);
  const meeting = running.find((r) => r.shared);
  if (meeting) {
    return { status: 'meeting', activity: clip(meeting.title), since: toIso(meeting.startedAt), roomId: meeting.roomId ?? 'ops' };
  }
  const cutoff = input.now - WORKING_WINDOW_S;
  const live = running.find((r) => Math.max(r.lastHeartbeatAt ?? 0, r.startedAt) >= cutoff);
  if (live) return { status: 'working', activity: clip(live.title), since: toIso(live.startedAt) };
  const s = input.session;
  if (s?.lastActivityAt != null && s.lastActivityAt >= cutoff) {
    const label = s.title ?? SOURCE_LABELS[s.source ?? ''] ?? 'Working';
    return { status: 'working', activity: clip(label), since: toIso(s.lastActivityAt) };
  }
  return null;
}

function idle(input: PresenceInput): Presence {
  const times = [input.session?.lastActivityAt ?? null, ...input.runs.map((r) => r.endedAt)]
    .filter((t): t is number => t !== null && t <= input.now);
  return times.length ? { status: 'idle', since: toIso(Math.max(...times)) } : { status: 'idle' };
}

export function derivePresence(input: PresenceInput): Presence {
  return offline(input) ?? failure(input) ?? work(input) ?? idle(input);
}

export const NO_BOT: Presence = Object.freeze({ status: 'no-bot' });
