// What waits on you in demo mode: fictional requests for the approvals inbox at Toby's desk. No secrets, no real
// task titles. A working or idle bot with a request is shown as needing you, exactly as the server does it.
import type { Approval, OfficeSnapshot } from '../contract';
import { DEMO_NOW, DEMO_SNAPSHOT } from './demo-snapshot';

const ago = (minutes: number) => new Date(Date.parse(DEMO_NOW) - minutes * 60_000).toISOString();
const UNBLOCK = { approve: 'Unblock it (your note goes on the card)', reject: 'Archive the card' };

export const DEMO_APPROVALS: Approval[] = [
  {
    id: 'hermes:t_demo_welcome.blocked', adapter: 'hermes', personId: 'andy', from: 'Andy Bernard', kind: 'question',
    title: 'Post the welcome thread to the Skool community?', detail: 'The draft is ready. Six new members joined this week; it tags all of them.',
    requestedAt: ago(7), risk: 'medium', decidable: true, actions: UNBLOCK,
  },
  {
    id: 'hermes:t_demo_gateway.blocked', adapter: 'hermes', personId: 'sadiq', from: 'Sadiq', kind: 'permission',
    title: 'Restart the gateway to clear the deploy-check timeout?', detail: 'Every bot drops off Telegram for about 30 seconds while it restarts.',
    requestedAt: ago(9), risk: 'high', decidable: true, actions: UNBLOCK,
  },
  {
    id: 'hermes:t_demo_video.blocked', adapter: 'hermes', from: 'party-planner', kind: 'task',
    title: 'Record the Thursday demo video', detail: 'The script is in the content plan. Mark it done once it is uploaded.',
    requestedAt: ago(52), risk: 'low', decidable: true, actions: { approve: 'Mark it done', reject: 'Archive the card' },
  },
  {
    id: 'hermes:t_demo_loop.triage', adapter: 'hermes', personId: 'kelly', from: 'Kelly Kapoor', kind: 'question',
    title: 'Instagram scheduling keeps failing', detail: 'Unblocked twice and blocked again for the same reason. Fix the cause in Hermes first.',
    requestedAt: ago(95), risk: 'medium', decidable: false,
  },
];

const WAITABLE = new Set(['working', 'idle']);

/** The demo office with its requests: a working or idle bot with one needs you (status needs-input). */
export function withApprovals(s: OfficeSnapshot, approvals: Approval[]): OfficeSnapshot {
  const newest = new Map<string, Approval>();
  for (const a of approvals) if (a.personId && !newest.has(a.personId)) newest.set(a.personId, a);
  const presence = Object.fromEntries(Object.entries(s.presence).map(([id, p]) => {
    const a = newest.get(id);
    return [id, a && WAITABLE.has(p.status) ? { status: 'needs-input' as const, activity: a.title, since: a.requestedAt } : p];
  }));
  return { ...s, presence, approvals };
}

export const DEMO_OFFICE: OfficeSnapshot = withApprovals(DEMO_SNAPSHOT, DEMO_APPROVALS);
