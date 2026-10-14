// A realistic, fully offline snapshot for demo mode and tests. No secrets: ids and display text only.
import type { OfficeSnapshot, Presence, Room, ScheduledJob, Task } from '../contract';
import { SEATS, STAFF, toPerson } from '../office';

export const DEMO_NOW = '2026-10-13T15:00:00.000Z';
const ago = (minutes: number) => new Date(Date.parse(DEMO_NOW) - minutes * 60_000).toISOString();

const BOT_PRESENCE: Record<string, Presence> = {
  pam: { status: 'working', activity: 'Routing 3 handoffs to the Council', since: ago(4) },
  michael: { status: 'meeting', activity: 'Council: Q4 pricing review', since: ago(18), roomId: 'council' },
  angela: { status: 'meeting', activity: 'Council: Q4 pricing review', since: ago(18), roomId: 'council' },
  dwight: { status: 'working', activity: 'Auditing the Q4 campaign report', since: ago(12) },
  oscar: { status: 'idle', since: ago(25) },
  kelly: { status: 'working', activity: 'Scheduling 4 posts for Thursday', since: ago(2) },
  andy: { status: 'idle', since: ago(41) },
  ryan: { status: 'offline', since: ago(180) },
  david: { status: 'idle', since: ago(65) },
  sadiq: { status: 'error', activity: 'Gateway timeout on the deploy check', since: ago(9) },
  jarvis: { status: 'working', activity: 'Summarising the inbox', since: ago(6) },
  ira: { status: 'working', activity: 'Logging lunch macros', since: ago(3) },
};

const people = STAFF.map(toPerson);
const presence: Record<string, Presence> = Object.fromEntries(
  STAFF.map((s) => [s.id, BOT_PRESENCE[s.id] ?? { status: 'no-bot' as const }]),
);

const areaOfSeat = new Map(SEATS.map((seat) => [seat.id, seat.areaId]));
const byProfile = new Map(STAFF.filter((s) => s.bot).map((s) => [s.bot!.profile, s.id]));
const ids = (...profiles: string[]) => profiles.map((p) => byProfile.get(p)!);

const teamRooms: Room[] = [
  { id: 'ops', name: 'Ops', areaId: 'conference', kind: 'ops', hermesRoom: 'ops', memberIds: ids('tech') },
  { id: 'council', name: 'Council', areaId: 'conference', kind: 'team', hermesRoom: 'council',
    memberIds: ids('chief', 'tech', 'strategist', 'ai-strategist', 'cmo', 'cfo') },
  { id: 'hq', name: 'HQ', areaId: 'reception', kind: 'team', hermesRoom: 'hq', memberIds: ids('chief') },
  { id: 'content', name: 'Content', areaId: 'annex', kind: 'team', hermesRoom: 'content', memberIds: ids('social') },
  { id: 'outreach', name: 'Outreach', areaId: 'bullpen', kind: 'team', hermesRoom: 'outreach', memberIds: ids('campaigns') },
  { id: 'skool', name: 'Skool', areaId: 'breakroom', kind: 'team', hermesRoom: 'skool', memberIds: ids('skool') },
  { id: 'rnd', name: 'R&D', areaId: 'warehouse', kind: 'team', hermesRoom: 'rnd', memberIds: ids('tech', 'ai-strategist') },
];

const dmRooms: Room[] = STAFF.filter((s) => s.bot).map((s) => ({
  id: `dm-${s.bot!.profile}`,
  name: 'Direct line',
  areaId: areaOfSeat.get(s.seatId) ?? 'bullpen',
  kind: 'dm' as const,
  hermesRoom: `dm-${s.bot!.profile}`,
  memberIds: [s.id],
}));

const tasks: Task[] = [
  { id: 'task-q4-pricing', title: 'Q4 pricing review', status: 'doing', ownerId: 'michael', roomId: 'council', shared: true, updatedAt: ago(18) },
  { id: 'task-fleet-health', title: 'Weekly fleet health check', status: 'blocked', ownerId: 'sadiq', roomId: 'ops', shared: true, updatedAt: ago(9) },
  { id: 'task-ops-handoffs', title: 'Hand off the Nashua leads to Outreach', status: 'todo', ownerId: 'pam', roomId: 'ops', shared: true, updatedAt: ago(30) },
  { id: 'task-q4-audit', title: 'Audit the Q4 campaign report', status: 'doing', ownerId: 'dwight', roomId: 'outreach', shared: false, updatedAt: ago(12) },
  { id: 'task-content-cal', title: 'Thursday content calendar', status: 'doing', ownerId: 'kelly', roomId: 'content', shared: false, updatedAt: ago(2) },
  { id: 'task-digest', title: 'Morning handoff digest', status: 'done', ownerId: 'pam', roomId: 'hq', shared: false, updatedAt: ago(95) },
  { id: 'task-skool-welcome', title: 'Welcome thread for new Skool members', status: 'todo', ownerId: 'andy', roomId: 'skool', shared: false, updatedAt: ago(41) },
  { id: 'task-inbox', title: 'Inbox summary', status: 'doing', ownerId: 'jarvis', roomId: 'dm-general', shared: false, updatedAt: ago(6) },
];

const ahead = (minutes: number) => new Date(Date.parse(DEMO_NOW) + minutes * 60_000).toISOString();

const jobs: Record<string, ScheduledJob[]> = {
  pam: [
    { name: 'Morning handoff digest', schedule: 'Weekdays 08:00', enabled: true, lastRunAt: ago(420), lastStatus: 'ok', nextRunAt: ahead(1020) },
    { name: 'Council agenda', schedule: 'Mondays 09:00', enabled: true, lastRunAt: ago(1800), lastStatus: 'ok', nextRunAt: ahead(8400) },
  ],
  dwight: [{ name: 'Weekly campaign report', schedule: 'Fridays 16:00', enabled: true, lastRunAt: ago(5400), lastStatus: 'ok', nextRunAt: ahead(4380) }],
  kelly: [{ name: 'Post queue check', schedule: 'Every 2 h', enabled: true, lastRunAt: ago(55), lastStatus: 'ok', nextRunAt: ahead(65) }],
  sadiq: [
    { name: 'Fleet health check', schedule: 'Hourly', enabled: true, lastRunAt: ago(9), lastStatus: 'error: gateway timeout', nextRunAt: ahead(51) },
    { name: 'Nightly backup verify', schedule: 'Daily 02:30', enabled: false, lastRunAt: ago(2190), lastStatus: 'ok' },
  ],
  ira: [{ name: 'Lunch macro reminder', schedule: 'Daily 12:30', enabled: true, lastRunAt: ago(150), lastStatus: 'ok', nextRunAt: ahead(1290) }],
};

export const DEMO_SNAPSHOT: OfficeSnapshot = {
  generatedAt: DEMO_NOW,
  people,
  presence,
  rooms: [...teamRooms, ...dmRooms],
  tasks,
  jobs,
};
