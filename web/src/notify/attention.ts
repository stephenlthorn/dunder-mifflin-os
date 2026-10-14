// What needs your attention: bots that change to error or start needing you. Pure.
import type { Person, Presence } from '@shared/contract';
import { shortName } from '../office/names';

export type AttentionKind = 'error' | 'needs-you';
export type AttentionEvent = { personId: string; kind: AttentionKind; name: string; text: string };
export type Unseen = ReadonlyMap<string, AttentionKind>;

/** From the canonical status: `needs-input` (waiting on you) or `error`. */
export function attentionOf(p: Presence | undefined): AttentionKind | null {
  if (p?.status === 'needs-input') return 'needs-you';
  return p?.status === 'error' ? 'error' : null;
}

/** Bots whose attention state changed into error or needs-you between two presence maps. */
export function attentionEvents(people: readonly Person[], prev: Readonly<Record<string, Presence>>, next: Readonly<Record<string, Presence>>): AttentionEvent[] {
  return people.flatMap((p) => {
    if (!p.bot) return [];
    const now = attentionOf(next[p.id]);
    if (!now || now === attentionOf(prev[p.id])) return [];
    return [{ personId: p.id, kind: now, name: p.name, text: next[p.id]?.activity?.trim() ?? '' }];
  });
}

export function addUnseen(unseen: Unseen, events: readonly AttentionEvent[]): Map<string, AttentionKind> {
  return new Map([...unseen, ...events.map((e) => [e.personId, e.kind] as const)]);
}

/** Drop bots that no longer need attention (they recovered before you looked). */
export function pruneUnseen(unseen: Unseen, presence: Readonly<Record<string, Presence>>): Map<string, AttentionKind> {
  return new Map([...unseen].filter(([id]) => attentionOf(presence[id]) !== null));
}

export function notificationText(e: AttentionEvent): { title: string; body: string } {
  const who = shortName(e.name);
  return e.kind === 'error'
    ? { title: `${who} hit an error`, body: e.text || 'Open Dunder Mifflin OS to see what happened.' }
    : { title: `${who} needs you`, body: e.text || 'Open Dunder Mifflin OS to answer.' };
}
