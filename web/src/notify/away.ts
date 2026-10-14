// "While you were away": what changed between the moment you left the tab and now. Pure.
import type { OfficeSnapshot, Presence, Task } from '@shared/contract';
import { shortName } from '../office/names';
import { attentionOf } from './attention';

export type AwayState = { presence: Readonly<Record<string, Presence>>; tasks: readonly Task[]; at: number };
export type AwayKind = 'error' | 'needs-you' | 'recovered' | 'working' | 'meeting' | 'idle' | 'offline' | 'online' | 'task';
export type AwayLine = { personId?: string; kind: AwayKind; text: string };

const URGENT: ReadonlySet<AwayKind> = new Set(['error', 'needs-you']);

export function awayDuration(ms: number): string {
  const mins = Math.round(ms / 60_000);
  if (mins < 1) return 'under a minute';
  if (mins < 60) return `${mins} min`;
  return `${Math.round(mins / 60)} h`;
}

function personLine(name: string, before: Presence, after: Presence, roomName: (id?: string) => string | undefined): Omit<AwayLine, 'personId'> | null {
  const activity = after.activity?.trim();
  const urgent = attentionOf(after);
  if (urgent && urgent !== attentionOf(before)) {
    return urgent === 'error'
      ? { kind: 'error', text: `${name} hit an error${activity ? `: ${activity}` : ''}` }
      : { kind: 'needs-you', text: `${name} needs you${activity ? `: ${activity}` : ''}` };
  }
  if (before.status === after.status) {
    const moved = after.status === 'working' && activity && activity !== before.activity?.trim();
    return moved ? { kind: 'working', text: `${name} moved on to: ${activity}` } : null;
  }
  if (before.status === 'error') return { kind: 'recovered', text: `${name} recovered and is ${after.status === 'meeting' ? 'in a meeting' : after.status}` };
  if (after.status === 'offline') return { kind: 'offline', text: `${name} went offline` };
  if (before.status === 'offline') return { kind: 'online', text: `${name} came back online` };
  if (after.status === 'meeting') return { kind: 'meeting', text: `${name} joined ${roomName(after.roomId) ?? 'a meeting'}` };
  if (before.status === 'meeting') return { kind: 'idle', text: `${name} left ${roomName(before.roomId) ?? 'the meeting'}` };
  if (after.status === 'working') return { kind: 'working', text: `${name} started working${activity ? `: ${activity}` : ''}` };
  return after.status === 'idle' ? { kind: 'idle', text: `${name} finished and is idle` } : null;
}

function taskLines(before: readonly Task[], after: readonly Task[], ownerName: (id?: string) => string | undefined): AwayLine[] {
  const old = new Map(before.map((t) => [t.id, t]));
  const added = after.filter((t) => !old.has(t.id)).map((t): AwayLine => {
    const owner = ownerName(t.ownerId);
    return { kind: 'task', personId: t.ownerId, text: owner ? `New task for ${owner}: ${t.title}` : `New task: ${t.title}` };
  });
  const changed = after.flatMap((t): AwayLine[] => {
    const was = old.get(t.id);
    if (!was || was.status === t.status || (t.status !== 'done' && t.status !== 'blocked')) return [];
    return [{ kind: 'task', personId: t.ownerId, text: `${t.status === 'done' ? 'Done' : 'Blocked'}: ${t.title}` }];
  });
  return [...added, ...changed];
}

export function awaySummary(before: AwayState, now: OfficeSnapshot, at: number): { away: string; lines: AwayLine[] } {
  const roomName = (id?: string) => now.rooms.find((r) => r.id === id)?.name;
  const people = new Map(now.people.map((p) => [p.id, p]));
  const ownerName = (id?: string) => { const p = id ? people.get(id) : undefined; return p ? shortName(p.name) : undefined; };
  const personLines = now.people.flatMap((p): AwayLine[] => {
    const was = before.presence[p.id];
    const is = now.presence[p.id];
    if (!p.bot || !was || !is) return [];
    const line = personLine(shortName(p.name), was, is, roomName);
    return line ? [{ personId: p.id, ...line }] : [];
  });
  const lines = [...personLines.filter((l) => URGENT.has(l.kind)), ...personLines.filter((l) => !URGENT.has(l.kind)), ...taskLines(before.tasks, now.tasks, ownerName)];
  return { away: awayDuration(at - before.at), lines };
}
