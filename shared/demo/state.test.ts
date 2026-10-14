import { describe, expect, it } from 'vitest';
import { STAFF } from '../office';
import { DEMO_CAST, DEMO_ROOMS } from './cast';
import { BEATS, DEMO_JOBS, DEMO_TASKS } from './script';
import { dayStateAt, messagesUpTo, nextChangeAfter } from './state';
import { DAY_END, DAY_START, hm } from './time';

const at = (time: string, seed = 1) => dayStateAt(hm(time), seed);
const taskStatus = (time: string, id: string) => at(time).tasks.find((t) => t.id === id)?.status;
const agents = new Set(DEMO_CAST.map((c) => c.agent));

describe('the demo cast', () => {
  it('seats bots at real characters only, and leaves the rest of the staff without one', () => {
    const staff = new Set(STAFF.map((s) => s.id));
    for (const c of DEMO_CAST) expect(staff.has(c.person), c.person).toBe(true);
    expect(new Set(DEMO_CAST.map((c) => c.person)).size).toBe(DEMO_CAST.length);
    for (const unbotted of ['jim', 'phyllis', 'stanley', 'toby']) expect(DEMO_CAST.some((c) => c.person === unbotted)).toBe(false);
  });

  it('has a direct line per bot and team rooms whose members are bots', () => {
    for (const r of DEMO_ROOMS) for (const m of r.members) expect(agents.has(m), `${r.key}: ${m}`).toBe(true);
    for (const c of DEMO_CAST) expect(DEMO_ROOMS.some((r) => r.key === `dm-${c.agent}` && r.kind === 'dm')).toBe(true);
    expect(DEMO_ROOMS.find((r) => r.key === 'council')).toMatchObject({ area: 'conference', kind: 'team' });
    expect(DEMO_ROOMS.find((r) => r.key === 'ops')).toMatchObject({ area: 'conference', kind: 'ops' });
  });

  it('only scripts known agents, rooms and tasks, inside the office day', () => {
    const rooms = new Set(DEMO_ROOMS.map((r) => r.key));
    for (const b of BEATS) {
      expect(b.at, JSON.stringify(b)).toBeGreaterThanOrEqual(DAY_START);
      expect(b.at, JSON.stringify(b)).toBeLessThan(DAY_END);
      if (b.kind === 'presence') {
        expect(agents.has(b.agent), b.agent).toBe(true);
        if (b.room) expect(rooms.has(b.room), b.room).toBe(true);
      }
      if (b.kind === 'task') expect(DEMO_TASKS.some((t) => t.id === b.task), b.task).toBe(true);
      if (b.kind === 'message') {
        expect(rooms.has(b.room), b.room).toBe(true);
        expect(agents.has(b.from), b.from).toBe(true);
      }
    }
    for (const t of DEMO_TASKS) expect(agents.has(t.owner), t.id).toBe(true);
    for (const j of DEMO_JOBS) expect(agents.has(j.agent), j.name).toBe(true);
  });
});

describe('a day at the branch', () => {
  it('starts with an empty office; the bots arrive through the morning (Ryan after lunch)', () => {
    const early = at('08:30');
    expect(Object.values(early.presence).every((p) => p.status === 'offline')).toBe(true);
    const morning = at('09:10');
    expect(morning.presence.sales?.status).toBe('working');
    expect(morning.presence.research).toMatchObject({ status: 'offline' });
    expect(at('13:00').presence.research?.status).not.toBe('offline');
  });

  it('holds the Council in the Conference Room on a shared task, then everyone walks back', () => {
    expect(taskStatus('10:00', 'pricing')).toBe('todo');
    const meeting = at('10:45');
    const inCouncil = Object.entries(meeting.presence).filter(([, p]) => p.status === 'meeting' && p.room === 'council').map(([a]) => a);
    expect(inCouncil.sort()).toEqual(['accounts', 'analyst', 'frontdesk', 'manager', 'strategy']);
    expect(meeting.tasks.find((t) => t.id === 'pricing')).toMatchObject({ status: 'doing', shared: true, room: 'council', owner: 'manager' });
    expect(taskStatus('11:30', 'pricing')).toBe('done');
    expect(Object.values(at('11:30').presence).some((p) => p.room === 'council')).toBe(false);
  });

  it("has one error, Kevin's import, which IT cleans up in an Ops review", () => {
    expect(at('10:45').presence.imports?.status).toBe('working');
    const spill = at('12:00');
    expect(spill.presence.imports).toMatchObject({ status: 'error', activity: expect.stringMatching(/chili/i) });
    expect(Object.entries(spill.presence).filter(([, p]) => p.status === 'error').map(([a]) => a)).toEqual(['imports']);
    expect(spill.jobs.imports?.[0]).toMatchObject({ name: 'Vendor price import', lastStatus: expect.stringMatching(/^error/) });
    expect(at('13:20').presence.imports).toMatchObject({ status: 'meeting', room: 'ops' });
    expect(taskStatus('14:30', 'import')).toBe('done');
    expect(at('14:30').jobs.imports?.[0]?.lastStatus).toBe('ok');
  });

  it('has one bot waiting on you (needs-input) for a while', () => {
    expect(at('11:05').presence.sales).toMatchObject({ status: 'needs-input', activity: expect.stringMatching(/your OK/) });
    expect(taskStatus('11:05', 'leads')).toBe('blocked');
    expect(at('11:45').presence.sales?.status).toBe('working');
    expect(Object.values(at('15:00').presence).some((p) => p.status === 'needs-input')).toBe(false);
  });

  it('fires scheduled jobs: an idle bot works while its job runs, and the job records the run', () => {
    expect(at('13:05').presence.assistant?.status).toBe('idle');
    expect(at('13:12').presence.assistant).toMatchObject({ status: 'working', activity: 'Running: Inbox summary' });
    const job = (time: string) => at(time).jobs.assistant?.find((j) => j.name === 'Inbox summary');
    expect(job('13:12')).toMatchObject({ lastRunAt: '2005-03-24T13:10:00.000Z', lastStatus: 'running', nextRunAt: '2005-03-25T09:10:00.000Z' });
    expect(job('09:05')).toMatchObject({ lastRunAt: '2005-03-23T13:10:00.000Z', lastStatus: 'ok', nextRunAt: '2005-03-24T09:10:00.000Z' });
  });

  it('moves tasks from todo to doing to done', () => {
    expect(['09:30', '10:20', '10:45'].map((t) => taskStatus(t, 'welcome'))).toEqual(['todo', 'doing', 'done']);
    expect(at('08:30').tasks.find((t) => t.id === 'welcome')).toBeUndefined();
  });

  it('chats in its rooms as the day goes on', () => {
    const before = messagesUpTo(hm('10:30'));
    const after = messagesUpTo(hm('11:20'));
    expect(after.length).toBeGreaterThan(before.length);
    expect(after.filter((m) => m.room === 'council').length).toBeGreaterThan(3);
    expect(after.every((m) => m.at <= hm('11:20'))).toBe(true);
    expect(messagesUpTo(hm('11:20')).map((m) => m.id)).toEqual(after.map((m) => m.id));
  });
});

describe('determinism', () => {
  it('gives the same office for the same minute and seed', () => {
    expect(at('14:47', 7)).toEqual(at('14:47', 7));
  });

  it('lets the seed vary the ambient work of idle bots, never what the script says', () => {
    const minutes = Array.from({ length: DAY_END - DAY_START }, (_, i) => DAY_START + i);
    const differs = minutes.some((m) => JSON.stringify(dayStateAt(m, 1).presence) !== JSON.stringify(dayStateAt(m, 2).presence));
    expect(differs).toBe(true);
    for (const seed of [1, 2, 3]) {
      expect(dayStateAt(hm('10:45'), seed).presence.manager?.status).toBe('meeting');
      expect(dayStateAt(hm('12:00'), seed).presence.imports?.status).toBe('error');
    }
  });

  it('knows the next minute anything changes, up to the end of the day', () => {
    const next = nextChangeAfter(hm('10:29'), 1);
    expect(next).toBe(hm('10:30'));
    expect(nextChangeAfter(DAY_END - 0.5, 1)).toBe(DAY_END);
    for (let m = DAY_START; m < DAY_END; m += 7) {
      const n = nextChangeAfter(m, 3);
      expect(n).toBeGreaterThan(m);
      expect(dayStateAt(n - 0.01, 3), `${m} -> ${n}`).toEqual(dayStateAt(m, 3)); // nothing changes in between
    }
  });
});
