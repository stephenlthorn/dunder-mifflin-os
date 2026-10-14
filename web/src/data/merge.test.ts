import { describe, expect, it } from 'vitest';
import type { OfficeSnapshot } from '@shared/contract';
import { applyEvent } from './merge';

const deepFreeze = <T>(o: T): T => {
  if (o && typeof o === 'object') {
    Object.values(o as object).forEach(deepFreeze);
    Object.freeze(o);
  }
  return o;
};

const base = (): OfficeSnapshot => deepFreeze({
  generatedAt: '2026-10-13T15:00:00.000Z',
  people: [],
  presence: { dwight: { status: 'working', activity: 'Auditing' }, pam: { status: 'idle' } },
  rooms: [],
  tasks: [
    { id: 't1', title: 'One', status: 'doing', shared: false, updatedAt: '2026-10-13T14:00:00.000Z' },
    { id: 't2', title: 'Two', status: 'todo', shared: true, updatedAt: '2026-10-13T14:00:00.000Z' },
  ],
});

describe('applyEvent', () => {
  it('replaces presence per person without mutating the snapshot', () => {
    const snap = base();
    const next = applyEvent(snap, { presence: { dwight: { status: 'idle' } } });
    expect(next.presence.dwight).toEqual({ status: 'idle' });
    expect(next.presence.pam).toBe(snap.presence.pam);
    expect(snap.presence.dwight.status).toBe('working');
    expect(next).not.toBe(snap);
  });

  it('adds presence for people it has not seen', () => {
    expect(applyEvent(base(), { presence: { kelly: { status: 'working' } } }).presence.kelly.status).toBe('working');
  });

  it('replaces the whole task list when an event carries tasks', () => {
    const next = applyEvent(base(), {
      tasks: [{ id: 't3', title: 'Three', status: 'todo', shared: false, updatedAt: '2026-10-13T15:00:00.000Z' }],
    });
    expect(next.tasks.map((t) => `${t.id}:${t.status}`)).toEqual(['t3:todo']);
  });

  it('treats an empty task list as "no tasks now"', () => {
    expect(applyEvent(base(), { tasks: [] }).tasks).toEqual([]);
  });

  it('keeps tasks untouched by a presence-only event', () => {
    const snap = base();
    expect(applyEvent(snap, { presence: { pam: { status: 'working' } } }).tasks).toBe(snap.tasks);
  });

  it('returns the same snapshot for an empty event', () => {
    const snap = base();
    expect(applyEvent(snap, {})).toBe(snap);
  });
});
