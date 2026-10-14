// Status derivation for the map: labels, chip text and fleet counts. Pure functions over contract data.
import type { BotStatus, Person, Presence } from '@shared/contract';

export type AnyStatus = Presence['status'];

export const STATUS_META: Record<AnyStatus, { color: string; word: string; legend: string }> = {
  working: { color: '#2fa84f', word: 'working', legend: 'Working' },
  idle: { color: '#e0a526', word: 'idle', legend: 'Idle' },
  meeting: { color: '#3478d4', word: 'in a meeting', legend: 'In a meeting' },
  error: { color: '#d64545', word: 'error', legend: 'Error' },
  offline: { color: '#8b9097', word: 'offline', legend: 'Offline' },
  'needs-input': { color: '#e8590c', word: 'needs you', legend: 'Needs you' },
  'no-bot': { color: '#b49a74', word: 'no bot yet', legend: 'No bot yet' },
};

export const statusWord = (s: AnyStatus): string => STATUS_META[s].word;

export function presenceFor(person: Person, presence: Readonly<Record<string, Presence>>): Presence {
  if (!person.bot) return { status: 'no-bot' };
  return presence[person.id] ?? { status: 'offline' };
}

export function personLabel(person: Person, p: Presence): string {
  if (!person.bot || p.status === 'no-bot') return `${person.name} — no bot yet`;
  return `${person.name} — ${person.bot.profile} — ${statusWord(p.status)}`;
}

const MAX_CHIP = 34;
const clip = (s: string) => (s.length > MAX_CHIP ? `${s.slice(0, MAX_CHIP - 1).trimEnd()}…` : s);

export function chipText(p: Presence, roomName?: string): string {
  switch (p.status) {
    case 'working':
      return clip(p.activity?.trim() || 'Working');
    case 'meeting':
      return clip(roomName ? `In ${roomName}` : 'In a meeting');
    case 'error':
      return clip(p.activity?.trim() ? `Error: ${p.activity.trim()}` : 'Error');
    case 'idle':
      return 'Idle';
    case 'offline':
      return 'Offline';
    case 'needs-input':
      return clip(p.activity?.trim() || 'Needs you');
    default:
      return 'No bot yet';
  }
}

export type FleetCounts = Record<BotStatus, number> & { bots: number; staff: number };

export function fleetCounts(people: readonly Person[], presence: Readonly<Record<string, Presence>>): FleetCounts {
  const counts: FleetCounts = {
    working: 0, idle: 0, meeting: 0, offline: 0, error: 0, 'needs-input': 0, bots: 0, staff: people.length,
  };
  return people.reduce((acc, person) => {
    const s = presenceFor(person, presence).status;
    if (s === 'no-bot') return acc;
    return { ...acc, [s]: acc[s] + 1, bots: acc.bots + 1 };
  }, counts);
}

/** "3 min ago" style relative time from an ISO stamp. */
export function sinceText(iso: string | undefined, now: number): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const mins = Math.max(0, Math.round((now - t) / 60_000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}
