import { describe, expect, it } from 'vitest';
import type { AgentMeeting } from '../src/adapters/types.ts';
import type { KanbanTask, RoomChat } from '../src/hermes/types.ts';
import type { KanbanComment, KanbanEvent, MeetingRecords, MeetingRun } from '../src/hermes/meetingTypes.ts';
import { buildMeetings } from '../src/domain/minutes.ts';
import { DIRTY_TEXT } from './adapters/contractSuite.ts';
import { LEAK_PATTERNS } from './helpers/leakScan.ts';

const T = 1_800_000_000; // a Friday, 2027-01-15
const H = 3600;
const task = (t: Partial<KanbanTask> & { id: string; title: string }): KanbanTask => ({
  assignee: null, status: 'done', createdBy: 'user', tenant: null, createdAt: T, startedAt: null, completedAt: null, lastHeartbeatAt: null, ...t,
});
const run = (r: Partial<MeetingRun> & { taskId: string; profile: string; startedAt: number }): MeetingRun => ({
  status: 'done', outcome: 'completed', endedAt: null, lastHeartbeatAt: null, summary: null, ...r,
});
const event = (taskId: string, kind: string, createdAt: number, profile: string | null = null, reason: string | null = null): KanbanEvent =>
  ({ taskId, kind, createdAt, profile, reason });
const comment = (taskId: string, author: string, body: string, createdAt: number): KanbanComment => ({ taskId, author, body, createdAt });

const COUNCIL: KanbanTask[] = [
  task({ id: 't_c1', title: 'Council 2027-01-15: round 1 cmo', assignee: 'cmo', createdBy: 'council', createdAt: T, completedAt: T + 600 }),
  task({ id: 't_c2', title: 'Council 2027-01-15: round 1 cfo', assignee: 'cfo', createdBy: 'council', createdAt: T + 5, completedAt: T + 700 }),
  task({ id: 't_c3', title: 'Council 2027-01-15: minutes', assignee: 'chief', createdBy: 'council', createdAt: T + 800, completedAt: T + 1200 }),
  task({ id: 't_c4', title: 'Council 2027-01-16: round 1 cmo', assignee: 'cmo', createdBy: 'council', status: 'running', createdAt: T + 20 * H }),
];
const SHARED = task({ id: 't_ops', title: 'Restock the copier paper', assignee: 'campaigns', status: 'blocked', createdBy: 'worker', createdAt: T + 2 * H });
const LINKED_A = task({ id: 't_la', title: 'Draft the launch post', assignee: 'social', status: 'todo', createdAt: T + 3 * H });
const LINKED_B = task({ id: 't_lb', title: 'Approve the launch post', assignee: 'chief', status: 'todo', createdAt: T + 3 * H });
const PRIVATE = task({ id: 't_solo', title: 'Solo card, no room', assignee: 'tech', createdAt: T + H });
const OLD = task({ id: 't_old', title: 'Old council', assignee: 'cmo', createdBy: 'council', createdAt: T - 30 * 24 * H, completedAt: T - 30 * 24 * H + 60 });

const RECORDS: MeetingRecords = {
  tasks: [...COUNCIL, SHARED, LINKED_A, LINKED_B, PRIVATE, OLD],
  runs: [
    run({ taskId: 't_c1', profile: 'cmo', startedAt: T + 60, endedAt: T + 600, summary: 'Raise prices 5%. Nobody ever lost money charging more for great paper.' }),
    run({ taskId: 't_c2', profile: 'cfo', startedAt: T + 90, endedAt: T + 700, summary: `Margins support 3%. ${DIRTY_TEXT}` }),
    run({ taskId: 't_c3', profile: 'chief', startedAt: T + 900, endedAt: T + 1200, summary: 'Agreed: 3% now, review in Q2.' }),
    run({ taskId: 't_c4', profile: 'cmo', status: 'running', outcome: null, startedAt: T + 20 * H + 60 }),
    run({ taskId: 't_ops', profile: 'campaigns', status: 'crashed', outcome: 'crashed', startedAt: T + 2 * H + 60, endedAt: T + 2 * H + 300 }),
  ],
  subs: [{ taskId: 't_ops', chatKey: 'chat-ops', chatType: 'group', notifierProfile: 'tech' }],
  links: [{ parentId: 't_la', childId: 't_lb', parentAssignee: 'social', childAssignee: 'chief' }],
  comments: [
    comment('t_c3', 'chief', 'Thanks all. Minutes to follow.', T + 1100),
    comment('t_ops', 'user', `Please hurry. ${'very '.repeat(120)}urgent ${DIRTY_TEXT}`, T + 2 * H + 400),
    comment('t_ops', 'tech', 'Looking at the crash.', T + 2 * H + 500),
  ],
  events: [
    event('t_ops', 'claimed', T + 2 * H + 60, 'campaigns'),
    event('t_ops', 'crashed', T + 2 * H + 300, 'campaigns'),
    event('t_ops', 'blocked', T + 2 * H + 600, null, `Out of paper; call ${DIRTY_TEXT}`),
    event('t_c1', 'claimed', T + 60, 'cmo'),
    event('t_c1', 'completed', T + 600, 'cmo'),
  ],
};
const ROOM_CHATS: RoomChat[] = [{ roomId: 'ops', chatKey: 'chat-ops', profiles: ['tech'] }];
const PERIOD = { from: T - 24 * H, to: T + 24 * H };

const meetings = buildMeetings(RECORDS, ROOM_CHATS, PERIOD);
const byId = (id: string): AgentMeeting => {
  const m = meetings.find((x) => x.id === id);
  if (!m) throw new Error(`no meeting ${id} in ${meetings.map((x) => x.id).join(', ')}`);
  return m;
};
const lineTexts = (m: AgentMeeting) => m.lines.map((l) => `${l.kind}|${l.authorAgentId ?? l.author ?? ''}|${l.text}`);

describe('buildMeetings: which cards are meetings', () => {
  it('makes one meeting per Council session and per shared card, newest first, within the period', () => {
    expect(meetings.map((m) => m.id)).toEqual(['council-t_c4', 'task-t_la', 'task-t_lb', 'task-t_ops', 'council-t_c1']);
    expect(meetings.map((m) => m.startedAt)).toEqual([...meetings.map((m) => m.startedAt)].sort().reverse());
  });

  it('leaves out cards nobody shares and anything outside the period', () => {
    const ids = meetings.flatMap((m) => m.agenda.map((a) => a.taskId));
    expect(ids).not.toContain('t_solo');
    expect(ids).not.toContain('t_old');
    expect(buildMeetings(RECORDS, ROOM_CHATS, { from: T - 31 * 24 * H, to: T - 29 * 24 * H }).map((m) => m.id)).toEqual(['council-t_old']);
  });
});

describe('a Council session', () => {
  const m = byId('council-t_c1');

  it('groups the session cards, chaired by Pam (chief), with the date as its title', () => {
    expect(m).toMatchObject({ kind: 'council', roomId: 'council', title: 'Council 2027-01-15', status: 'adjourned' });
    expect(m.participantAgentIds).toEqual(['chief', 'cmo', 'cfo']);
    expect(m.agenda.map((a) => [a.title, a.ownerAgentId, a.status])).toEqual([
      ['round 1 cmo', 'cmo', 'done'], ['round 1 cfo', 'cfo', 'done'], ['minutes', 'chief', 'done'],
    ]);
    expect(m.startedAt).toBe(new Date((T + 60) * 1000).toISOString());
    expect(m.endedAt).toBe(new Date((T + 1200) * 1000).toISOString());
  });

  it('writes the minutes from the record: who picked up what, results, comments, adjournment', () => {
    const lines = lineTexts(m);
    expect(lines[0]).toBe('opened|Council|Session opened with 3 items on the agenda');
    expect(lines).toContain('started|cmo|Picked up “round 1 cmo”');
    expect(lines).toContain('status|cmo|Finished “round 1 cmo”');
    expect(lines).toContain('started|cfo|Picked up “round 1 cfo”'); // from the run: this card has no events
    expect(lines).toContain('result|cmo|Raise prices 5%. Nobody ever lost money charging more for great paper.');
    expect(lines).toContain('comment|chief|Thanks all. Minutes to follow.');
    expect(lines.at(-1)).toBe('closed||Adjourned');
    const times = m.lines.map((l) => l.at);
    expect([...times].sort()).toEqual(times);
  });

  it('a session still running is in session, with no end', () => {
    expect(byId('council-t_c4')).toMatchObject({ status: 'in-session', title: 'Council 2027-01-16' });
    expect(byId('council-t_c4').endedAt).toBeUndefined();
  });
});

describe('a shared card', () => {
  const m = byId('task-t_ops');

  it('is a meeting in its room, owned by its assignee, joined by whoever commented', () => {
    expect(m).toMatchObject({ kind: 'shared-task', roomId: 'ops', title: 'Restock the copier paper', status: 'blocked' });
    expect(m.participantAgentIds).toEqual(['campaigns', 'tech']);
    expect(m.endedAt).toBeUndefined();
  });

  it('says what happened, in plain words, without the card title on every line', () => {
    const lines = lineTexts(m);
    expect(lines[0]).toBe('opened|worker|Card opened');
    expect(lines).toContain('started|campaigns|Picked it up');
    expect(lines).toContain('status|campaigns|The run crashed');
    expect(lines.find((l) => l.startsWith('status||Blocked: Out of paper'))).toBeDefined();
    expect(lines.find((l) => l.startsWith('comment|You|Please hurry.'))).toBeDefined();
  });

  it('scrubs secrets and truncates long text', () => {
    const json = JSON.stringify(meetings);
    for (const [kind, re] of LEAK_PATTERNS) expect(re.test(json), kind).toBe(false);
    for (const line of meetings.flatMap((x) => x.lines)) expect(line.text.length).toBeLessThanOrEqual(400);
    const hurry = m.lines.find((l) => l.text.startsWith('Please hurry'));
    expect(hurry?.text.length).toBeLessThanOrEqual(280);
    expect(hurry?.text.endsWith('…')).toBe(true);
  });

  it('linked cards of different bots are shared and land in Ops', () => {
    expect(byId('task-t_la')).toMatchObject({ roomId: 'ops', status: 'scheduled', participantAgentIds: ['social'] });
  });
});

describe('limits', () => {
  it('keeps the latest lines of a very long meeting and says it was cut', () => {
    const many = { ...RECORDS, comments: Array.from({ length: 300 }, (_, i) => comment('t_ops', 'tech', `note ${i}`, T + 2 * H + 700 + i)) };
    const m = buildMeetings(many, ROOM_CHATS, PERIOD).find((x) => x.id === 'task-t_ops');
    expect(m?.truncated).toBe(true);
    expect(m?.lines.length).toBeLessThanOrEqual(120);
    expect(m?.lines.at(-1)?.text).toBe('note 299');
  });

  it('never mutates the records', () => {
    const frozen = JSON.parse(JSON.stringify(RECORDS)) as MeetingRecords;
    buildMeetings(frozen, ROOM_CHATS, PERIOD);
    expect(frozen).toEqual(JSON.parse(JSON.stringify(RECORDS)));
  });
});
