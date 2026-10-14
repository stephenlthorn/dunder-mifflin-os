import { describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/domain/snapshot.ts';
import { diffSnapshots, fullUpdate } from '../src/domain/diff.ts';
import { toAgentMessages } from '../src/domain/messages.ts';
import { loadPeople } from '../src/people.ts';
import type { HermesState, RawMessage } from '../src/hermes/types.ts';
import type { OfficeSnapshot } from '../../shared/contract.ts';

const NOW = 1_800_000_000;
const iso = (s: number) => new Date(s * 1000).toISOString();
const platform = (profile: string, state = 'connected') => ({ profile, state, errorCode: null, updatedAt: iso(NOW - 999) });

const STATE: HermesState = {
  recordedAt: iso(NOW),
  gateway: { running: true, platforms: [platform('tech'), platform('campaigns'), platform('cmo', 'disconnected')] },
  telegram: [
    { profile: 'tech', enabled: true, groupChats: ['c_ops'], leadChats: ['c_ops'], roomHints: { c_ops: 'Ops' } },
    { profile: 'chief', enabled: true, groupChats: ['c_council'], leadChats: ['c_council'], roomHints: { c_council: 'Council' } },
  ],
  chatNames: {},
  kanban: {
    tasks: [{ id: 't_1', title: 'Ship the map', assignee: 'campaigns', status: 'running', createdBy: 'dmos-ops', tenant: null, createdAt: NOW - 600, startedAt: NOW - 300, completedAt: null, lastHeartbeatAt: NOW - 20 }],
    runs: [{ taskId: 't_1', profile: 'campaigns', status: 'running', outcome: null, startedAt: NOW - 300, endedAt: null, lastHeartbeatAt: NOW - 20 }],
    subs: [], links: [],
  },
  sessions: [{ profile: 'tech', lastActivityAt: NOW - 30, title: 'Set up new Ops room', source: 'telegram' }],
  cron: [],
  personas: { tech: 'Sadiq', campaigns: 'Dwight Schrute' },
};

describe('buildSnapshot', () => {
  const snap = buildSnapshot(STATE, loadPeople(), NOW);

  it('keeps a keepName person\'s own name and shows the Hermes persona name beside it', () => {
    const withHank = buildSnapshot({ ...STATE, personas: { ...STATE.personas, health: 'Hank' } }, loadPeople(), NOW);
    expect(withHank.people.find((p) => p.id === 'ira')).toMatchObject({ name: 'Sensei Ira', persona: 'Hank', bot: { profile: 'health' } });
    expect(withHank.people.find((p) => p.id === 'dwight')).not.toHaveProperty('persona');
    expect(snap.people.find((p) => p.id === 'ira')).toMatchObject({ name: 'Sensei Ira' });
    expect(snap.people.find((p) => p.id === 'ira')).not.toHaveProperty('persona');
  });

  it('leaves out the persona line when it says the same as the name', () => {
    const same = buildSnapshot({ ...STATE, personas: { health: 'Sensei Ira' } }, loadPeople(), NOW);
    expect(same.people.find((p) => p.id === 'ira')).not.toHaveProperty('persona');
  });

  it('carries every person, bots overlaid from the roster and live personas', () => {
    expect(snap.people).toHaveLength(23);
    const sadiq = snap.people.find((p) => p.id === 'sadiq');
    expect(sadiq).toMatchObject({ name: 'Sadiq', bot: { profile: 'tech', role: 'CTO: leads Ops and R&D' } });
    expect(snap.people.find((p) => p.id === 'jim')?.bot).toBeUndefined();
  });

  it('derives presence per person', () => {
    expect(snap.presence.dwight).toMatchObject({ status: 'meeting', roomId: 'ops', activity: 'Ship the map' });
    expect(snap.presence.sadiq).toMatchObject({ status: 'working', activity: 'Set up new Ops room' });
    expect(snap.presence.michael).toMatchObject({ status: 'offline' });
    expect(snap.presence.pam).toMatchObject({ status: 'offline', activity: 'No Telegram connection' });
    expect(snap.presence.jim).toEqual({ status: 'no-bot' });
    expect(Object.keys(snap.presence)).toHaveLength(23);
  });

  it('includes rooms and tasks and a timestamp', () => {
    expect(snap.generatedAt).toBe(iso(NOW));
    expect(snap.rooms.find((r) => r.id === 'ops')?.hermesRoom).toBe('Ops');
    expect(snap.tasks).toEqual([{ id: 't_1', title: 'Ship the map', status: 'doing', ownerId: 'dwight', roomId: 'ops', shared: true, updatedAt: iso(NOW - 20) }]);
  });

  it('never leaks chat keys into the snapshot', () => {
    expect(JSON.stringify(snap)).not.toMatch(/c_ops|c_council/);
  });
});

describe('diffSnapshots (SSE)', () => {
  const base: OfficeSnapshot = buildSnapshot(STATE, loadPeople(), NOW);

  it('sends nothing when nothing changed (generatedAt alone does not count)', () => {
    expect(diffSnapshots(base, { ...base, generatedAt: iso(NOW + 5) })).toBeNull();
  });

  it('sends only the presence entries that changed', () => {
    const next = { ...base, presence: { ...base.presence, sadiq: { status: 'idle' as const } } };
    expect(diffSnapshots(base, next)).toEqual({ presence: { sadiq: { status: 'idle' } } });
  });

  it('sends the whole task list when any task changed', () => {
    const next = { ...base, tasks: [] };
    expect(diffSnapshots(base, next)).toEqual({ tasks: [] });
  });

  it('builds a full update for a newly connected client', () => {
    expect(fullUpdate(base)).toEqual({ presence: base.presence, tasks: base.tasks, approvals: [] }); // Hermes fixture: nothing pending
  });
});

describe('toAgentMessages', () => {
  const raw = (over: Partial<RawMessage> & { uid: string }): RawMessage => ({
    profile: 'tech', role: 'assistant', text: 'hello', at: NOW, origin: 'telegram', platformMessageId: null, ...over,
  });

  it('maps roles to authors (the bot\'s profile; none = the user), strips sender tags, drops NO_REPLY, sorts by time', () => {
    const msgs = toAgentMessages([
      raw({ uid: 'b', role: 'assistant', text: 'On it.', at: NOW + 2 }),
      raw({ uid: 'a', role: 'user', text: '[Jan Levinson] status?', at: NOW + 1 }),
      raw({ uid: 'c', role: 'assistant', text: 'NO_REPLY', at: NOW + 3 }),
      raw({ uid: 'd', role: 'user', text: '[Ops room] from the OS', at: NOW + 4, origin: 'os' }),
      raw({ uid: 'e', role: 'user', text: '[Replying to: "x"] ok', at: NOW + 5 }),
    ], 'ops', 50);
    expect(msgs).toEqual([
      { id: 'tech-a', roomId: 'ops', text: 'status?', at: iso(NOW + 1) },
      { id: 'tech-b', roomId: 'ops', authorAgentId: 'tech', text: 'On it.', at: iso(NOW + 2) },
      { id: 'tech-d', roomId: 'ops', text: 'from the OS', at: iso(NOW + 4) },
      { id: 'tech-e', roomId: 'ops', text: '[Replying to: "x"] ok', at: iso(NOW + 5) },
    ]);
  });

  it('dedupes the same Telegram message seen by two bots', () => {
    const msgs = toAgentMessages([
      raw({ uid: 'x1', profile: 'chief', role: 'user', text: 'council?', platformMessageId: '77' }),
      raw({ uid: 'x2', profile: 'cmo', role: 'user', text: 'council?', platformMessageId: '77' }),
      raw({ uid: 'y1', profile: 'chief', role: 'user', text: 'again', at: NOW + 10 }),
      raw({ uid: 'y2', profile: 'cfo', role: 'user', text: 'again', at: NOW + 11 }),
      raw({ uid: 'z', profile: 'cmo', role: 'assistant', text: 'Sell more paper.', at: NOW + 20 }),
    ], 'council', 50);
    expect(msgs.map((m) => [m.authorAgentId ?? 'user', m.text])).toEqual([['user', 'council?'], ['user', 'again'], ['cmo', 'Sell more paper.']]);
  });

  it('keeps the newest messages up to the limit and caps text length', () => {
    const many = Array.from({ length: 80 }, (_, i) => raw({ uid: `m${i}`, at: NOW + i, text: 'x'.repeat(5000) }));
    const msgs = toAgentMessages(many, 'ops', 50);
    expect(msgs).toHaveLength(50);
    expect(msgs[0]?.id).toBe('tech-m30');
    expect(msgs[0]?.text.length).toBeLessThanOrEqual(4000);
  });
});

describe('toAgentMessages dedupe scope', () => {
  it('does not merge an OS-thread message with a Telegram message that shares an id', () => {
    const base = { profile: 'tech', role: 'user' as const, text: 'same', at: NOW, platformMessageId: '1' };
    const msgs = toAgentMessages([{ ...base, uid: 'a', origin: 'telegram' }, { ...base, uid: 'b', origin: 'os' }], 'ops', 10);
    expect(msgs).toHaveLength(2);
  });
});

describe('buildSnapshot jobs (cron/jobs.json)', () => {
  const job = { profile: 'tech', id: 'j1', name: 'ops-heartbeat', enabled: true, schedule: '0 9 * * *', nextRunAt: '2026-10-14T13:00:00.000Z', lastRunAt: null, lastStatus: 'ok' };

  it('lists scheduled jobs by person id with names, schedules and an opaque id to run them by', () => {
    const snap = buildSnapshot({ ...STATE, cron: [job, { ...job, profile: 'stamford', id: 'j2' }] }, loadPeople(), NOW);
    expect(snap.jobs).toEqual({ sadiq: [{ id: 'jobj1', name: 'ops-heartbeat', schedule: '0 9 * * *', enabled: true, lastStatus: 'ok', nextRunAt: '2026-10-14T13:00:00.000Z' }] });
  });

  it('masks long digit runs (chat ids) in job names', () => {
    const snap = buildSnapshot({ ...STATE, cron: [{ ...job, name: 'Post to -1001234567890 daily' }, { ...job, name: 'DM 5550001 at 9' }] }, loadPeople(), NOW);
    expect(snap.jobs?.sadiq?.map((j) => j.name)).toEqual(['Post to [id] daily', 'DM … at 9']);
  });

  it('is an empty record when no bot has jobs', () => {
    expect(buildSnapshot(STATE, loadPeople(), NOW).jobs).toEqual({});
  });
});
