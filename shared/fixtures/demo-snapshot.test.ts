import { describe, expect, it } from 'vitest';
import { DEMO_SNAPSHOT } from './demo-snapshot';

describe('demo snapshot', () => {
  it('includes every staff member with a presence', () => {
    expect(DEMO_SNAPSHOT.people).toHaveLength(23);
    for (const p of DEMO_SNAPSHOT.people) expect(DEMO_SNAPSHOT.presence[p.id], p.id).toBeDefined();
  });

  it('marks unbotted staff as no-bot and varies the bot statuses', () => {
    expect(DEMO_SNAPSHOT.presence.jim.status).toBe('no-bot');
    const statuses = new Set(Object.values(DEMO_SNAPSHOT.presence).map((p) => p.status));
    for (const s of ['working', 'idle', 'offline', 'error', 'meeting', 'no-bot']) expect(statuses.has(s as never), s).toBe(true);
  });

  it('puts two bots in the Conference Room on a shared task', () => {
    const conferenceRooms = new Set(DEMO_SNAPSHOT.rooms.filter((r) => r.areaId === 'conference').map((r) => r.id));
    const inMeeting = Object.entries(DEMO_SNAPSHOT.presence).filter(([, p]) => p.roomId && conferenceRooms.has(p.roomId));
    expect(inMeeting).toHaveLength(2);
    const roomId = inMeeting[0][1].roomId;
    expect(DEMO_SNAPSHOT.tasks.some((t) => t.shared && t.roomId === roomId)).toBe(true);
  });

  it('lists scheduled jobs for some bots', () => {
    expect(DEMO_SNAPSHOT.jobs?.pam?.length).toBeGreaterThan(0);
    expect(Object.keys(DEMO_SNAPSHOT.jobs ?? {}).every((id) => DEMO_SNAPSHOT.people.some((p) => p.id === id))).toBe(true);
  });

  it('has the default room map, with ops and council both in the Conference Room', () => {
    const where = Object.fromEntries(DEMO_SNAPSHOT.rooms.map((r) => [r.id, r.areaId]));
    expect(where).toMatchObject({
      ops: 'conference', council: 'conference', hq: 'reception', content: 'annex',
      outreach: 'bullpen', skool: 'breakroom', rnd: 'warehouse', 'dm-campaigns': 'bullpen', 'dm-chief': 'reception',
    });
    expect(DEMO_SNAPSHOT.rooms.find((r) => r.id === 'ops')!.kind).toBe('ops');
    expect(DEMO_SNAPSHOT.rooms.filter((r) => r.kind === 'dm')).toHaveLength(12);
  });
});
