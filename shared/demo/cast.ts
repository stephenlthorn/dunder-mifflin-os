// Who has a bot in the demo day and where its rooms are. Agent ids are the demo adapter's own; the office seats each
// at its character. Everyone else on the staff list keeps "No bot yet". Fictional data only: no real bots, people,
// customers or tasks. Room keys are local; the adapter prefixes them with its id ('demo-council').
import type { BotStatus, Room } from '../contract';

export type DemoAgent = { readonly agent: string; readonly person: string; readonly role: string };
export type DemoRoom = {
  readonly key: string;
  readonly name: string;
  readonly kind: Room['kind'];
  readonly area?: string; // a direct line sits at its bot's desk
  readonly members: ReadonlyArray<string>; // lead first
};
export type DemoStatus = BotStatus;

export const DEMO_CAST: ReadonlyArray<DemoAgent> = Object.freeze([
  { agent: 'frontdesk', person: 'pam', role: 'Front desk: triage and handoffs' },
  { agent: 'manager', person: 'michael', role: 'Regional manager: chairs the Council' },
  { agent: 'sales', person: 'dwight', role: 'Sales: leads and follow-ups' },
  { agent: 'accounts', person: 'angela', role: 'Accounts: invoices and expenses' },
  { agent: 'analyst', person: 'oscar', role: 'Analyst: reports and forecasts' },
  { agent: 'imports', person: 'kevin', role: 'Data imports' },
  { agent: 'social', person: 'kelly', role: 'Social and content' },
  { agent: 'community', person: 'andy', role: 'Community and events' },
  { agent: 'research', person: 'ryan', role: 'Research: the weekly AI digest' },
  { agent: 'strategy', person: 'david', role: 'Corporate: strategy' },
  { agent: 'it', person: 'sadiq', role: 'IT: deploys and monitoring' },
  { agent: 'assistant', person: 'jarvis', role: 'General assistant' },
  { agent: 'wellness', person: 'ira', role: 'Wellness: breaks and stretches' },
].map((a) => Object.freeze(a)));

const TEAM_ROOMS: ReadonlyArray<DemoRoom> = [
  { key: 'ops', name: 'Ops', kind: 'ops', area: 'conference', members: ['it', 'frontdesk'] },
  { key: 'council', name: 'Council', kind: 'team', area: 'conference', members: ['manager', 'accounts', 'analyst', 'strategy', 'frontdesk'] },
  { key: 'sales', name: 'Sales', kind: 'team', area: 'bullpen', members: ['sales'] },
  { key: 'content', name: 'Content', kind: 'team', area: 'annex', members: ['social', 'research'] },
  { key: 'events', name: 'Events', kind: 'team', area: 'breakroom', members: ['community', 'wellness'] },
  { key: 'rnd', name: 'R&D', kind: 'team', area: 'warehouse', members: ['research', 'it'] },
];

export const DEMO_ROOMS: ReadonlyArray<DemoRoom> = Object.freeze([
  ...TEAM_ROOMS,
  ...DEMO_CAST.map((c): DemoRoom => ({ key: `dm-${c.agent}`, name: 'Direct line', kind: 'dm', members: [c.agent] })),
].map((r) => Object.freeze({ ...r, members: Object.freeze([...r.members]) })));

/** The room where new shared tasks are created and worked (bots walk to it). */
export const DEMO_TASK_ROOM = 'ops';
