import { describe, expect, it } from 'vitest';
import { derivePresence, type PresenceInput, type RunView } from '../src/domain/presence.ts';

const NOW = 1_800_000_000; // epoch seconds
const iso = (s: number) => new Date(s * 1000).toISOString();
const connected = { profile: 'tech', state: 'connected', errorCode: null, updatedAt: iso(NOW - 86_400) };

const base = (over: Partial<PresenceInput> = {}): PresenceInput => ({
  now: NOW, gatewayRunning: true, platform: connected, runs: [], session: undefined, cron: [], ...over,
});
const run = (over: Partial<RunView> = {}): RunView => ({
  title: 'Fix the copier', status: 'running', outcome: null, startedAt: NOW - 120, endedAt: null,
  lastHeartbeatAt: NOW - 30, shared: false, ...over,
});

describe('derivePresence: offline', () => {
  it('is offline when the gateway is not running or unreadable', () => {
    expect(derivePresence(base({ gatewayRunning: false }))).toMatchObject({ status: 'offline', activity: 'Gateway not running' });
    expect(derivePresence(base({ gatewayRunning: null }))).toMatchObject({ status: 'offline', activity: 'Gateway status unavailable' });
  });

  it('is offline when the bot has no telegram platform or it is not connected', () => {
    expect(derivePresence(base({ platform: undefined }))).toMatchObject({ status: 'offline' });
    expect(derivePresence(base({ platform: { ...connected, state: 'disconnected' } })))
      .toMatchObject({ status: 'offline', activity: 'Telegram disconnected', since: connected.updatedAt });
  });

  it('offline wins over work in progress', () => {
    expect(derivePresence(base({ gatewayRunning: false, runs: [run()] })).status).toBe('offline');
  });
});

describe('derivePresence: error', () => {
  it('is error when the platform reports an error code', () => {
    expect(derivePresence(base({ platform: { ...connected, state: 'fatal', errorCode: 'telegram_conflict' } })))
      .toMatchObject({ status: 'error', activity: 'Telegram error: telegram_conflict' });
  });

  it('is error when a run crashed or timed out in the last 60 minutes', () => {
    const crashed = run({ status: 'crashed', outcome: 'crashed', endedAt: NOW - 59 * 60 });
    expect(derivePresence(base({ runs: [crashed] }))).toMatchObject({ status: 'error', activity: 'Task crashed: Fix the copier', since: iso(NOW - 59 * 60) });
    const timedOut = run({ status: 'timed_out', outcome: 'timed_out', endedAt: NOW - 10 });
    expect(derivePresence(base({ runs: [timedOut] }))).toMatchObject({ status: 'error', activity: 'Task timed out: Fix the copier' });
  });

  it('forgets a crash after 60 minutes', () => {
    const old = run({ status: 'crashed', outcome: 'crashed', endedAt: NOW - 61 * 60 });
    expect(derivePresence(base({ runs: [old] })).status).toBe('idle');
  });

  it('is error when a scheduled job failed in the last 60 minutes', () => {
    const job = { profile: 'tech', id: 'j', name: 'ops-heartbeat', enabled: true, schedule: '0 9 * * *', nextRunAt: null, lastRunAt: iso(NOW - 600), lastStatus: 'error' };
    expect(derivePresence(base({ cron: [job] }))).toMatchObject({ status: 'error', activity: 'Scheduled job failed: ops-heartbeat' });
    expect(derivePresence(base({ cron: [{ ...job, lastStatus: 'ok' }] })).status).toBe('idle');
  });

  it('error wins over a meeting', () => {
    const crashed = run({ status: 'crashed', outcome: 'crashed', endedAt: NOW - 60 });
    expect(derivePresence(base({ runs: [crashed, run({ shared: true, roomId: 'ops' })] })).status).toBe('error');
  });
});

describe('derivePresence: meeting', () => {
  it('is in a meeting (in the room) while running a shared task', () => {
    expect(derivePresence(base({ runs: [run({ shared: true, roomId: 'council', title: 'Council round 2' })] })))
      .toEqual({ status: 'meeting', activity: 'Council round 2', since: iso(NOW - 120), roomId: 'council' });
  });

  it('defaults the meeting room to ops (the Conference Room hosts every shared task)', () => {
    expect(derivePresence(base({ runs: [run({ shared: true })] })).roomId).toBe('ops');
  });
});

describe('derivePresence: working', () => {
  it('is working with a running run whose heartbeat is under 5 minutes old', () => {
    expect(derivePresence(base({ runs: [run()] }))).toEqual({ status: 'working', activity: 'Fix the copier', since: iso(NOW - 120) });
  });

  it('counts a just-started run without a heartbeat yet', () => {
    expect(derivePresence(base({ runs: [run({ lastHeartbeatAt: null, startedAt: NOW - 60 })] })).status).toBe('working');
  });

  it('a stale heartbeat is not working', () => {
    expect(derivePresence(base({ runs: [run({ lastHeartbeatAt: NOW - 301, startedAt: NOW - 900 })] })).status).toBe('idle');
  });

  it('is working when a session was active in the last 5 minutes', () => {
    const session = { profile: 'tech', lastActivityAt: NOW - 200, title: 'Set up new Ops room', source: 'telegram' };
    expect(derivePresence(base({ session }))).toEqual({ status: 'working', activity: 'Set up new Ops room', since: iso(NOW - 200) });
  });

  it('labels an untitled session by its source', () => {
    const session = { profile: 'tech', lastActivityAt: NOW - 5, title: null, source: 'cron' };
    expect(derivePresence(base({ session })).activity).toBe('Running a scheduled job');
  });
});

describe('derivePresence: idle', () => {
  it('is idle otherwise, since the last activity', () => {
    const session = { profile: 'tech', lastActivityAt: NOW - 3600, title: 'Old chat', source: 'telegram' };
    const done = run({ status: 'done', outcome: 'completed', endedAt: NOW - 1800 });
    expect(derivePresence(base({ session, runs: [done] }))).toEqual({ status: 'idle', since: iso(NOW - 1800) });
  });

  it('is idle without any history', () => {
    expect(derivePresence(base())).toEqual({ status: 'idle' });
  });
});
