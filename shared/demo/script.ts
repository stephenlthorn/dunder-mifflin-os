// "Threat Level Midnight": the scripted day the demo replays. Bots arrive, work their cards and hold a morning
// standup; late morning brings the drama at once: the Council meets in the Conference Room, Kevin's import spills
// chili (the day's one error) and Dwight waits for your OK (needs-input). After lunch Ops reviews the spill, jobs keep
// firing, and everyone goes home. All of it is fiction: no real bots, people or data.
import type { Task } from '../contract';
import type { DemoStatus } from './cast';
import { hm } from './time';

export type PresenceBeat = {
  readonly kind: 'presence'; readonly at: number; readonly agent: string; readonly status: DemoStatus; readonly activity?: string; readonly room?: string;
};
export type TaskBeat = { readonly kind: 'task'; readonly at: number; readonly task: string; readonly status: Task['status'] };
export type MessageBeat = { readonly kind: 'message'; readonly at: number; readonly room: string; readonly from: string; readonly text: string };
export type Beat = PresenceBeat | TaskBeat | MessageBeat;

export type DemoTaskSpec = { readonly id: string; readonly title: string; readonly owner: string; readonly room?: string; readonly shared?: boolean };
export type JobRun = { readonly at: number; readonly minutes: number; readonly status?: string };
export type DemoJobSpec = {
  readonly agent: string; readonly name: string; readonly schedule: string; readonly enabled: boolean; readonly runs: ReadonlyArray<JobRun>;
};

const p = (at: string, agent: string, status: DemoStatus, activity?: string, room?: string): PresenceBeat =>
  ({ kind: 'presence', at: hm(at), agent, status, ...(activity ? { activity } : {}), ...(room ? { room } : {}) });
const t = (at: string, task: string, status: Task['status']): TaskBeat => ({ kind: 'task', at: hm(at), task, status });
const m = (at: string, room: string, from: string, text: string): MessageBeat => ({ kind: 'message', at: hm(at), room, from, text });
const tasks = (id: string, steps: ReadonlyArray<readonly [string, Task['status']]>): TaskBeat[] => steps.map(([at, s]) => t(at, id, s));
const meeting = (at: string, room: string, activity: string, agents: ReadonlyArray<string>): PresenceBeat[] =>
  agents.map((a) => p(at, a, 'meeting', activity, room));

export const DEMO_TASKS: ReadonlyArray<DemoTaskSpec> = Object.freeze([
  { id: 'standup', title: 'Morning standup', owner: 'it', room: 'ops', shared: true },
  { id: 'invoices', title: 'Reconcile October invoices', owner: 'accounts' },
  { id: 'forecast', title: 'Refresh the Q4 forecast', owner: 'analyst' },
  { id: 'leads', title: 'Follow up with 40 warm leads', owner: 'sales', room: 'sales' },
  { id: 'memo', title: 'Motivational memo', owner: 'manager' },
  { id: 'pricing', title: 'Q4 pricing review', owner: 'manager', room: 'council', shared: true },
  { id: 'welcome', title: "Welcome this week's new members", owner: 'community', room: 'events' },
  { id: 'posts', title: "Schedule Thursday's posts", owner: 'social', room: 'content' },
  { id: 'import', title: 'Import the vendor price list', owner: 'imports' },
  { id: 'cleanup', title: 'Clean up the half-finished import', owner: 'it', room: 'ops', shared: true },
  { id: 'party', title: "Plan Friday's office birthday", owner: 'community', room: 'events' },
  { id: 'digest', title: 'Write the weekly AI digest', owner: 'research', room: 'content' },
  { id: 'goals', title: "Draft next quarter's goals", owner: 'strategy' },
].map((s) => Object.freeze(s)));

const ARRIVALS: Beat[] = [
  p('08:31', 'it', 'working', "Checking last night's deploys"),
  p('08:34', 'frontdesk', 'working', 'Sorting the overnight inbox'),
  p('08:38', 'analyst', 'working', 'Refreshing the Q4 forecast'),
  p('08:41', 'accounts', 'working', 'Reconciling October invoices'),
  p('08:44', 'sales', 'working', "Ranking today's leads"),
  p('08:47', 'assistant', 'idle'),
  p('08:50', 'wellness', 'working', "Setting today's step goal"),
  p('08:52', 'social', 'working', "Drafting Thursday's posts"),
  p('08:56', 'imports', 'idle'),
  p('09:00', 'wellness', 'idle'),
  p('09:02', 'manager', 'working', 'Writing a motivational memo'),
  p('09:05', 'community', 'idle'),
  p('09:20', 'strategy', 'idle'),
  m('09:00', 'dm-frontdesk', 'frontdesk', "Good morning! Today's handoff digest is ready."),
  m('09:03', 'dm-manager', 'manager', "Today's memo: be the manager you would want to have. Also, cake on Friday."),
];

const STANDUP: Beat[] = [
  ...meeting('09:15', 'ops', 'Morning standup', ['it', 'frontdesk', 'sales', 'social']),
  m('09:15', 'ops', 'it', "Standup: last night's deploys are green. Anything blocking?"),
  m('09:17', 'ops', 'sales', 'Forty warm leads today. I will reach every one of them.'),
  m('09:19', 'ops', 'social', "Thursday's posts are drafted; scheduling them after this."),
  m('09:21', 'ops', 'frontdesk', "Three handoffs this morning. I'll route them after standup."),
  m('09:20', 'dm-assistant', 'assistant', 'Inbox summary: 12 new, 3 need a reply, nothing on fire.'),
  p('09:25', 'it', 'working', 'Patching the printer driver'),
  p('09:25', 'frontdesk', 'working', 'Routing three handoffs'),
  p('09:25', 'sales', 'working', 'Following up with warm leads'),
  p('09:25', 'social', 'working', "Scheduling Thursday's posts"),
  m('09:26', 'sales', 'sales', 'Starting follow-ups. Forty leads, ranked by how likely they are to buy.'),
  p('09:30', 'manager', 'working', 'Setting the Council agenda'),
  m('09:35', 'council', 'manager', 'Council at 10:30: Q4 pricing. Attendance is mandatory, and also fun.'),
  p('09:40', 'manager', 'idle'),
  p('10:00', 'frontdesk', 'idle'),
  p('10:00', 'it', 'idle'),
  m('10:00', 'dm-wellness', 'wellness', 'Stretch break. Shoulders down, deep breath.'),
  p('10:05', 'analyst', 'idle'),
  p('10:15', 'community', 'working', 'Welcoming new members'),
  m('10:16', 'events', 'community', "Welcome thread is up for this week's new members."),
  p('10:20', 'accounts', 'idle'),
  p('10:40', 'community', 'idle'),
];

const COUNCIL: Beat[] = [
  ...meeting('10:30', 'council', 'Council: Q4 pricing review', ['manager', 'accounts', 'analyst', 'strategy']),
  p('10:30', 'frontdesk', 'meeting', 'Council: taking the minutes', 'council'),
  m('10:31', 'council', 'manager', "Let's begin. Oscar, numbers?"),
  m('10:36', 'council', 'analyst', 'Costs are up 4%. A 3% price rise keeps margins flat.'),
  m('10:44', 'council', 'accounts', 'Agreed, provided nobody expenses the celebration.'),
  m('10:52', 'council', 'strategy', 'Corporate can support 3%, if the biggest clients hear it from us first.'),
  m('11:05', 'council', 'frontdesk', 'Minutes: a 3% rise from next month; the biggest clients get a call first.'),
  m('11:14', 'council', 'manager', 'Great meeting, everyone. Possibly the greatest.'),
  p('11:15', 'manager', 'working', 'Announcing the new prices'),
  p('11:15', 'accounts', 'working', 'Updating the price sheet'),
  p('11:15', 'analyst', 'working', 'Double-checking the new prices'),
  p('11:15', 'strategy', 'idle'),
  p('11:15', 'frontdesk', 'working', 'Sending the Council minutes'),
  p('11:30', 'strategy', 'working', "Drafting next quarter's goals"),
  p('11:40', 'manager', 'idle'),
  p('11:40', 'frontdesk', 'idle'),
  m('11:50', 'content', 'social', "Thursday's posts are scheduled!"),
  p('11:50', 'social', 'idle'),
  p('10:58', 'sales', 'needs-input', 'Waiting for your OK to email 40 leads'),
  m('10:58', 'sales', 'sales', 'Forty follow-up emails are ready. Waiting for your OK before I send them.'),
  m('10:59', 'dm-sales', 'sales', 'I need your OK to send 40 follow-up emails.'),
  p('11:40', 'sales', 'working', 'Sending the follow-up emails'),
  m('11:40', 'sales', 'sales', 'Approved. Sending now.'),
  p('12:00', 'sales', 'idle', 'Lunch: beet salad at the desk'),
  p('12:05', 'accounts', 'idle'),
  p('12:10', 'analyst', 'idle'),
  m('12:20', 'sales', 'sales', 'All forty sent. Seven replies already.'),
  p('12:30', 'sales', 'working', 'Logging the replies'),
  m('12:30', 'events', 'wellness', 'Lunch reminder: eat something green.'),
];

const CHILI: Beat[] = [
  p('10:40', 'imports', 'working', 'Importing the vendor price list'),
  p('10:52', 'imports', 'error', 'Spilled chili on the import: 3,000 rows half-loaded'),
  m('10:53', 'dm-imports', 'imports', 'Small problem with the import. Mostly the chili.'),
  p('10:55', 'it', 'working', "Looking into Kevin's import"),
  m('10:56', 'ops', 'it', "Kevin's import fell over halfway. Opening a cleanup task."),
  ...meeting('13:15', 'ops', 'Ops: import incident review', ['it', 'imports']),
  m('13:16', 'ops', 'imports', 'In my defence, the chili was very good.'),
  m('13:28', 'ops', 'it', 'Root cause: nothing stops a half-finished import. Adding a guard now.'),
  m('13:34', 'ops', 'frontdesk', 'Cleanup done. Kevin is re-running the import.'),
  p('13:35', 'it', 'working', 'Adding a guard to the import'),
  p('13:35', 'imports', 'working', 'Re-running the import (carefully)'),
  p('14:05', 'imports', 'idle'),
  p('14:20', 'it', 'idle'),
];

const AFTERNOON: Beat[] = [
  p('12:55', 'research', 'working', 'Catching up on AI news'),
  m('12:56', 'rnd', 'research', 'Back in. Reading up on agent memory.'),
  p('13:00', 'social', 'working', 'Replying to comments'),
  m('13:01', 'content', 'social', "Replying to comments on yesterday's post."),
  p('13:00', 'frontdesk', 'working', 'Ordering the birthday cake'),
  p('13:30', 'frontdesk', 'idle'),
  p('13:40', 'research', 'idle'),
  p('14:00', 'analyst', 'working', 'Writing the monthly report'),
  p('14:15', 'community', 'working', "Planning Friday's birthday party"),
  m('14:16', 'events', 'community', "Friday's birthday party: cake, streamers, and no surprises this time."),
  p('13:30', 'sales', 'working', 'Calling back the seven who replied'),
  p('14:30', 'social', 'idle'),
  p('15:00', 'manager', 'working', 'Rehearsing a birthday speech'),
  p('15:30', 'research', 'working', 'Writing the weekly AI digest'),
  p('15:40', 'community', 'idle'),
  m('15:40', 'events', 'community', 'Party is planned. RSVPs are open.'),
  p('15:45', 'manager', 'idle'),
  p('16:00', 'strategy', 'idle'),
  p('16:10', 'analyst', 'idle'),
  p('16:20', 'sales', 'idle'),
  p('16:30', 'research', 'idle'),
  m('16:31', 'content', 'research', "This week's AI digest is ready for review."),
  p('16:40', 'frontdesk', 'working', "Writing tomorrow's handoffs"),
  p('16:45', 'strategy', 'offline', 'Back to corporate'),
  p('17:00', 'manager', 'offline', 'Gone home'),
  p('17:00', 'research', 'offline', 'Gone home early'),
  p('17:05', 'imports', 'offline', 'Gone home'),
  p('17:10', 'social', 'offline', 'Gone home'),
  p('17:15', 'frontdesk', 'offline', 'Gone home'),
  p('17:15', 'community', 'offline', 'Gone home'),
  p('17:20', 'sales', 'offline', 'Gone home'),
  p('17:25', 'analyst', 'offline', 'Gone home'),
  p('17:28', 'accounts', 'offline', 'Gone home'),
];

const TASKS: Beat[] = [
  ...tasks('standup', [['08:31', 'todo'], ['09:15', 'doing'], ['09:25', 'done']]),
  ...tasks('invoices', [['08:41', 'doing'], ['10:20', 'done']]),
  ...tasks('forecast', [['08:38', 'doing'], ['10:05', 'done']]),
  ...tasks('leads', [['08:44', 'todo'], ['09:25', 'doing'], ['10:58', 'blocked'], ['11:40', 'doing'], ['12:20', 'done']]),
  ...tasks('memo', [['09:02', 'doing'], ['09:30', 'done']]),
  ...tasks('pricing', [['09:35', 'todo'], ['10:30', 'doing'], ['11:15', 'done']]),
  ...tasks('welcome', [['09:05', 'todo'], ['10:15', 'doing'], ['10:40', 'done']]),
  ...tasks('posts', [['08:52', 'doing'], ['11:50', 'done']]),
  ...tasks('import', [['09:00', 'todo'], ['10:40', 'doing'], ['10:52', 'blocked'], ['13:35', 'doing'], ['14:05', 'done']]),
  ...tasks('cleanup', [['10:56', 'todo'], ['13:15', 'doing'], ['13:35', 'done']]),
  ...tasks('party', [['13:00', 'todo'], ['14:15', 'doing'], ['15:40', 'done']]),
  ...tasks('digest', [['12:55', 'todo'], ['15:30', 'doing'], ['16:30', 'done']]),
  ...tasks('goals', [['09:20', 'todo'], ['11:30', 'doing'], ['16:00', 'done']]),
];

/** Every beat of the day, in time order (stable for equal times). */
export const BEATS: ReadonlyArray<Beat> = Object.freeze(
  [...ARRIVALS, ...STANDUP, ...COUNCIL, ...CHILI, ...AFTERNOON, ...TASKS].map((b, i) => ({ b, i }))
    .sort((x, y) => x.b.at - y.b.at || x.i - y.i).map(({ b }) => Object.freeze(b)),
);

const runs = (minutes: number, ...times: string[]): JobRun[] => times.map((at) => ({ at: hm(at), minutes }));
const hourly = (minute: string, from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => `${from + i}:${minute}`);

export const DEMO_JOBS: ReadonlyArray<DemoJobSpec> = Object.freeze([
  { agent: 'frontdesk', name: 'Morning handoff digest', schedule: 'Weekdays 09:00', enabled: true, runs: runs(10, '09:00') },
  { agent: 'manager', name: 'Council agenda', schedule: 'Thursdays 09:30', enabled: true, runs: runs(5, '09:30') },
  { agent: 'sales', name: 'Lead sync', schedule: 'Hourly at :15', enabled: true, runs: runs(5, ...hourly('15', 9, 16)) },
  { agent: 'accounts', name: 'Expense check', schedule: 'Daily 11:00 and 15:00', enabled: true, runs: runs(10, '11:00', '15:00') },
  { agent: 'analyst', name: 'Forecast refresh', schedule: 'Weekdays 08:40', enabled: true, runs: runs(20, '08:40') },
  {
    agent: 'imports', name: 'Vendor price import', schedule: 'Weekdays 10:40', enabled: true,
    runs: [{ at: hm('10:40'), minutes: 12, status: 'error: chili on the keyboard' }, { at: hm('13:35'), minutes: 30 }],
  },
  { agent: 'social', name: 'Post queue check', schedule: 'Every 2 h', enabled: true, runs: runs(5, '09:30', '11:30', '13:30', '15:30') },
  { agent: 'community', name: 'Welcome new members', schedule: 'Thursdays 10:15', enabled: true, runs: runs(15, '10:15') },
  { agent: 'research', name: 'Weekly AI digest', schedule: 'Thursdays 15:30', enabled: true, runs: runs(60, '15:30') },
  { agent: 'strategy', name: 'Branch numbers review', schedule: 'Mondays 10:00', enabled: false, runs: [] },
  { agent: 'it', name: 'Fleet health check', schedule: 'Hourly', enabled: true, runs: runs(3, ...hourly('00', 9, 17)) },
  { agent: 'assistant', name: 'Inbox summary', schedule: 'Daily 09:10 and 13:10', enabled: true, runs: runs(10, '09:10', '13:10') },
  { agent: 'wellness', name: 'Stretch reminder', schedule: 'Every 2 h', enabled: true, runs: runs(2, '10:00', '12:00', '14:00', '16:00') },
  { agent: 'wellness', name: 'Lunch reminder', schedule: 'Daily 12:30', enabled: true, runs: runs(2, '12:30') },
].map((j) => Object.freeze({ ...j, runs: Object.freeze(j.runs.map((r) => Object.freeze(r))) })));
