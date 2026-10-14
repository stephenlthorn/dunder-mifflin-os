import { describe, expect, it } from 'vitest';
import { DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { buildPamItems } from './items';

const items = buildPamItems(DEMO_SNAPSHOT, { filter: 'all', view: 'map', writable: true });
const byId = (id: string, list = items) => list.find((i) => i.id === id)!;
const kinds = (kind: string) => items.filter((i) => i.kind === kind);

describe('Ask Pam items', () => {
  it('indexes people, bots, rooms, places, tasks, jobs and actions', () => {
    expect(kinds('person')).toHaveLength(23);
    expect(kinds('bot')).toHaveLength(12);
    expect(kinds('room').map((i) => i.id).sort()).toEqual(['room:content', 'room:council', 'room:hq', 'room:ops', 'room:outreach', 'room:rnd', 'room:skool']);
    expect(kinds('place').map((i) => i.id).sort()).toEqual(['place:kitchen', 'place:lobby', 'place:michael', 'place:restrooms', 'place:stairwell']);
    expect(kinds('task')).toHaveLength(DEMO_SNAPSHOT.tasks.length);
    expect(kinds('job')).toHaveLength(7);
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
  });

  it('a person opens their window; Shift+Enter shows them on the map', () => {
    const dwight = byId('person:dwight');
    expect(dwight.label).toBe('Dwight Schrute');
    expect(dwight.detail).toBe('campaigns · working — Auditing the Q4 campaign report');
    expect(dwight.status).toBe('working');
    expect(dwight.action).toEqual({ type: 'open-person', personId: 'dwight' });
    expect(dwight.alt).toEqual({ type: 'show-person', personId: 'dwight' });
    expect(byId('person:jim').detail).toBe('Sales Representative · no bot yet');
  });

  it('a timeline item opens their window on the Timeline tab, read-only server or not; Angela\'s ledger is an action', () => {
    expect(kinds('timeline')).toHaveLength(12);
    expect(byId('timeline:dwight')).toMatchObject({ label: 'Timeline: Dwight', action: { type: 'timeline', personId: 'dwight' }, alt: { type: 'show-person', personId: 'dwight' } });
    expect(buildPamItems(DEMO_SNAPSHOT, { filter: 'all', view: 'map', writable: false }).filter((i) => i.kind === 'timeline')).toHaveLength(12);
    expect(byId('action:ledger').action).toEqual({ type: 'ledger' });
  });

  it('a bot item starts a chat', () => {
    const bot = byId('bot:dwight');
    expect(bot.label).toBe('Chat with Dwight');
    expect(bot.action).toEqual({ type: 'chat', personId: 'dwight' });
    expect(byId('bot:ira').label).toBe('Chat with Sensei Ira');
  });

  it('rooms open their area window on that tab; places only move the camera', () => {
    expect(byId('room:council').action).toEqual({ type: 'open-area', areaId: 'conference', roomId: 'council' });
    expect(byId('room:council').detail).toContain('Conference Room');
    expect(byId('room:council').alt).toEqual({ type: 'show-area', areaId: 'conference' });
    expect(byId('place:kitchen').action).toEqual({ type: 'show-area', areaId: 'kitchen' });
  });

  it('a task opens its room, or its owner when the room is a direct line', () => {
    expect(byId('task:task-q4-pricing').action).toEqual({ type: 'open-area', areaId: 'conference', roomId: 'council' });
    expect(byId('task:task-inbox').action).toEqual({ type: 'open-person', personId: 'jarvis' });
    expect(byId('task:task-fleet-health').detail).toBe('Blocked · Sadiq · Ops');
  });

  it('a scheduled job opens its owner\'s window', () => {
    const job = items.find((i) => i.kind === 'job' && i.label === 'Fleet health check')!;
    expect(job.action).toEqual({ type: 'open-person', personId: 'sadiq' });
    expect(job.detail).toBe('Sadiq · Hourly');
    expect(items.find((i) => i.label === 'Nightly backup verify')!.detail).toBe('Sadiq · Daily 02:30 · paused');
  });

  it('offers the Conference Room, fleet filters, the list view, shortcuts and settings', () => {
    const actions = kinds('action').map((i) => i.id);
    expect(actions).toEqual([
      'action:conference', 'action:minutes', 'action:calendar', 'action:ledger', 'action:filter-working', 'action:filter-needs-you', 'action:filter-error',
      'action:view', 'action:shortcuts', 'action:settings',
    ]);
    expect(byId('action:conference').action).toEqual({ type: 'open-area', areaId: 'conference' });
    expect(byId('action:minutes').action).toEqual({ type: 'open-area', areaId: 'conference', roomId: 'minutes' });
    expect(byId('action:calendar').action).toEqual({ type: 'calendar' });
    expect(byId('action:calendar').label).toBe('Open the Party Planning Committee calendar');
    expect(byId('action:filter-error').action).toEqual({ type: 'filter', filter: 'error' });
    expect(byId('action:view').action).toEqual({ type: 'view', view: 'list' });
  });

  it('a filter that is already on turns off, and "Show everyone" appears', () => {
    const on = buildPamItems(DEMO_SNAPSHOT, { filter: 'error', view: 'list', writable: true });
    expect(byId('action:filter-error', on).action).toEqual({ type: 'filter', filter: 'all' });
    expect(byId('action:filter-error', on).detail).toMatch(/^On/);
    expect(byId('action:filter-all', on).action).toEqual({ type: 'filter', filter: 'all' });
    expect(byId('action:view', on).action).toEqual({ type: 'view', view: 'map' });
  });

  it('shows bots that need you (the needs-input status)', () => {
    const snap = { ...DEMO_SNAPSHOT, presence: { ...DEMO_SNAPSHOT.presence, kelly: { status: 'needs-input' as const, activity: 'Approve the posts?' } } };
    const list = buildPamItems(snap, { filter: 'all', view: 'map', writable: true });
    expect(byId('person:kelly', list).status).toBe('needs-input');
    expect(byId('person:kelly', list).detail).toBe('social · needs you — Approve the posts?');
  });

  it('offers no chats on a read-only server, nor for a bot whose adapter cannot chat', () => {
    const readOnly = buildPamItems(DEMO_SNAPSHOT, { filter: 'all', view: 'map', writable: false });
    expect(readOnly.filter((i) => i.kind === 'bot')).toEqual([]);
    expect(readOnly.filter((i) => i.kind === 'person')).toHaveLength(23);
    const mute = { chat: false, createTask: false, approvals: false, pause: false, stop: false };
    const snap = { ...DEMO_SNAPSHOT, people: DEMO_SNAPSHOT.people.map((p) => (p.id === 'kelly' ? { ...p, bot: { ...p.bot!, capabilities: mute } } : p)) };
    const list = buildPamItems(snap, { filter: 'all', view: 'map', writable: true });
    expect(list.find((i) => i.id === 'bot:kelly')).toBeUndefined();
    expect(list.filter((i) => i.kind === 'bot')).toHaveLength(11);
  });
});
