import { describe, expect, it } from 'vitest';
import type { OfficeSnapshot, Presence, Task } from '@shared/contract';
import { DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { awayDuration, awaySummary } from './away';

const T0 = Date.parse('2026-10-13T15:00:00Z');
const before = { presence: DEMO_SNAPSHOT.presence, tasks: DEMO_SNAPSHOT.tasks, at: T0 };
const after = (presence: Record<string, Presence>, tasks: Task[] = DEMO_SNAPSHOT.tasks): OfficeSnapshot =>
  ({ ...DEMO_SNAPSHOT, presence: { ...DEMO_SNAPSHOT.presence, ...presence }, tasks });
const texts = (snap: OfficeSnapshot) => awaySummary(before, snap, T0 + 12 * 60_000).lines.map((l) => l.text);

describe('awaySummary', () => {
  it('is empty when nothing changed', () => {
    expect(awaySummary(before, DEMO_SNAPSHOT, T0 + 60_000).lines).toEqual([]);
  });

  it('lists errors and needs-you first, then other status changes', () => {
    const lines = awaySummary(before, after({
      kelly: { status: 'idle' },
      dwight: { status: 'error', activity: 'Ad account locked' },
      andy: { status: 'working', activity: 'Welcoming new members' },
      david: { status: 'needs-input', activity: 'Approve the Q4 budget?' },
    }), T0 + 12 * 60_000).lines;
    expect(lines.map((l) => [l.personId, l.kind])).toEqual([
      ['dwight', 'error'], ['david', 'needs-you'], ['kelly', 'idle'], ['andy', 'working'],
    ]);
    expect(lines.map((l) => l.text)).toEqual([
      'Dwight hit an error: Ad account locked',
      'David needs you: Approve the Q4 budget?',
      'Kelly finished and is idle',
      'Andy started working: Welcoming new members',
    ]);
  });

  it('describes meetings, recoveries and going offline or online', () => {
    expect(texts(after({ dwight: { status: 'meeting', roomId: 'ops' } }))).toEqual(['Dwight joined Ops']);
    expect(texts(after({ michael: { status: 'idle' } }))).toEqual(['Michael left Council']);
    expect(texts(after({ sadiq: { status: 'idle' } }))).toEqual(['Sadiq recovered and is idle']);
    expect(texts(after({ pam: { status: 'offline' } }))).toEqual(['Pam went offline']);
    expect(texts(after({ ryan: { status: 'idle' } }))).toEqual(['Ryan came back online']);
    expect(texts(after({ dwight: { status: 'working', activity: 'Calling Scranton leads' } }))).toEqual(['Dwight moved on to: Calling Scranton leads']);
  });

  it('reports new, finished and blocked tasks', () => {
    const tasks: Task[] = [
      ...DEMO_SNAPSHOT.tasks.map((t) => (t.id === 'task-q4-audit' ? { ...t, status: 'done' as const } : t.id === 'task-content-cal' ? { ...t, status: 'blocked' as const } : t)),
      { id: 'task-new', title: 'Order more paper', status: 'todo', ownerId: 'dwight', shared: false, updatedAt: '' },
    ];
    expect(texts(after({}, tasks))).toEqual([
      'New task for Dwight: Order more paper', 'Done: Audit the Q4 campaign report', 'Blocked: Thursday content calendar',
    ]);
  });

  it('measures how long you were away', () => {
    expect(awaySummary(before, DEMO_SNAPSHOT, T0 + 12 * 60_000).away).toBe('12 min');
    expect(awayDuration(20_000)).toBe('under a minute');
    expect(awayDuration(3 * 3_600_000 + 60_000)).toBe('3 h');
    expect(awayDuration(-5)).toBe('under a minute');
  });
});
