import { describe, expect, it } from 'vitest';
import { DEMO_APPROVALS, DEMO_OFFICE } from './demo-approvals';
import { DEMO_SNAPSHOT } from './demo-snapshot';

describe('demo approvals (the inbox at Toby\'s desk in demo mode)', () => {
  it('are fictional requests from real desks (or an agent without one), each id once', () => {
    const people = new Set(DEMO_SNAPSHOT.people.map((p) => p.id));
    expect(new Set(DEMO_APPROVALS.map((a) => a.id)).size).toBe(DEMO_APPROVALS.length);
    for (const a of DEMO_APPROVALS) if (a.personId) expect(people.has(a.personId), a.personId).toBe(true);
    expect(DEMO_APPROVALS.some((a) => !a.personId)).toBe(true);
    expect(DEMO_APPROVALS.some((a) => !a.decidable)).toBe(true);
  });

  it('show a working or idle bot with a request as needing you, like the server does, and leave everyone else alone', () => {
    expect(DEMO_OFFICE.approvals).toEqual(DEMO_APPROVALS);
    expect(DEMO_OFFICE.presence.andy).toMatchObject({ status: 'needs-input', activity: DEMO_APPROVALS.find((a) => a.personId === 'andy')?.title });
    expect(DEMO_OFFICE.presence.sadiq?.status).toBe('error'); // errors say more; the hand still goes up
    expect(DEMO_OFFICE.presence.dwight).toEqual(DEMO_SNAPSHOT.presence.dwight);
  });
});
