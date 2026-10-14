// "Needs you": who raises a hand on the map, the top bar's "N need you", when Pam's phone rings, and whether you can
// decide an approval from here. Pure functions over contract data. The canonical per-bot signal is status
// `needs-input` (the fleet filters and notifications read it); approvals add bots in other states and agents without a desk.
import type { Approval, OfficeSnapshot } from '@shared/contract';

/** Toby Flenderson's HR desk is the approvals inbox: clicking him opens it. He stays "No bot yet" as a person. */
export const HR_DESK = 'toby';

const pending = (s: OfficeSnapshot): readonly Approval[] => s.approvals ?? [];

/** People with a raised hand: status needs-input, or something pending in the inbox. */
export function askingIds(s: OfficeSnapshot): ReadonlySet<string> {
  const waiting = Object.entries(s.presence).filter(([, p]) => p.status === 'needs-input').map(([id]) => id);
  const asking = pending(s).flatMap((a) => (a.personId ? [a.personId] : []));
  return new Set([...waiting, ...asking]);
}

/** The top bar's "N need you": every asker once, plus each request from an agent without a desk. */
export function needYouCount(s: OfficeSnapshot): number {
  return askingIds(s).size + pending(s).filter((a) => !a.personId).length;
}

/** What rings the phone without a needs-input change (those already chime through the notifications). */
export function phoneKeys(s: OfficeSnapshot): ReadonlySet<string> {
  return new Set(pending(s)
    .filter((a) => !a.personId || s.presence[a.personId]?.status !== 'needs-input')
    .map((a) => `approval:${a.id}`));
}

export function newRings(before: ReadonlySet<string>, after: ReadonlySet<string>): string[] {
  return [...after].filter((k) => !before.has(k));
}

/** Why the Approve/Reject buttons are off for this item, or null when you can decide it here. */
export function decideBlocker(s: OfficeSnapshot, a: Approval, writable: boolean): string | null {
  if (!a.decidable) return `Answer this one where ${a.from} runs; the office only shows it.`;
  const adapter = s.adapters?.find((x) => x.id === a.adapter);
  if (adapter && !adapter.capabilities.approvals) return `${adapter.label} agents can't take decisions from the office.`;
  if (!writable) return 'Read-only: restart the server with DMOS_ALLOW_WRITES=1 (or --allow-writes) to decide here.';
  return null;
}
