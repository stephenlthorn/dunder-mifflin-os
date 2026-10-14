// Kanban records -> Conference Room meetings with minutes (the Hermes adapter's `meetings` capability). Pure; no LLM.
// A meeting is either a Council session (cards created by 'council', grouped by the date in their titles and by
// time: a gap of over 3 h starts a new session) or a shared card (its room is Ops/Council, or it's linked to
// another bot's card: tasks.ts decides). Meetings active in the period are returned, newest first.
import type { MeetingStatus, Task } from '../../../shared/contract.ts';
import type { AgentMeeting, Period } from '../adapters/types.ts';
import type { EpochSeconds, RoomChat } from '../hermes/types.ts';
import type { MeetingRecords } from '../hermes/meetingTypes.ts';
import { roomById } from '../rooms.ts';
import { isBotProfile } from '../roster.ts';
import { annotateTasks, mapKanbanStatus, type TaskInfo } from './tasks.ts';
import { toIso } from './presence.ts';
import { byTimeThenKind, cardLines, clip, who, TITLE_MAX, type CardRecord, type Line } from './minutesText.ts';

const SESSION_GAP_S = 3 * 3600;
const MAX_LINES = 120;
const MAX_MEETINGS = 100;
const COUNCIL_TITLE = /^Council (\d{4}-\d{2}-\d{2})\b:?\s*/;

type Built = { readonly meeting: AgentMeeting; readonly startS: EpochSeconds; readonly lastS: EpochSeconds };

function indexBy<T extends { readonly taskId: string }>(rows: ReadonlyArray<T>): ReadonlyMap<string, ReadonlyArray<T>> {
  return rows.reduce((m, r) => m.set(r.taskId, [...(m.get(r.taskId) ?? []), r]), new Map<string, T[]>());
}

function cardsOf(records: MeetingRecords): (info: TaskInfo) => CardRecord {
  const runs = indexBy(records.runs);
  const comments = indexBy(records.comments);
  const events = indexBy(records.events);
  return ({ task }) => ({ task, runs: runs.get(task.id) ?? [], comments: comments.get(task.id) ?? [], events: events.get(task.id) ?? [] });
}

const councilDate = (title: string): string | null => COUNCIL_TITLE.exec(title)?.[1] ?? null;

function sessions(council: ReadonlyArray<TaskInfo>): TaskInfo[][] {
  const sorted = [...council].sort((a, b) => a.task.createdAt - b.task.createdAt);
  return sorted.reduce<TaskInfo[][]>((groups, info) => {
    const group = groups.at(-1);
    const prev = group?.at(-1);
    const joins = prev && info.task.createdAt - prev.task.createdAt <= SESSION_GAP_S && councilDate(info.task.title) === councilDate(prev.task.title);
    return joins && group ? [...groups.slice(0, -1), [...group, info]] : [...groups, [info]];
  }, []);
}

const agendaStatus = (status: string): Task['status'] => mapKanbanStatus(status) ?? 'done'; // archived = closed

function meetingStatus(statuses: ReadonlyArray<Task['status']>): MeetingStatus {
  if (statuses.includes('doing')) return 'in-session';
  if (statuses.includes('blocked')) return 'blocked';
  if (statuses.every((s) => s === 'done')) return 'adjourned';
  return statuses.includes('done') ? 'in-session' : 'scheduled';
}

function firstStart(card: CardRecord): EpochSeconds {
  const starts = [...card.runs.map((r) => r.startedAt), ...card.events.filter((e) => e.kind === 'claimed').map((e) => e.createdAt)];
  return starts.length > 0 ? Math.min(...starts) : (card.task.startedAt ?? card.task.createdAt);
}

function lastEnd(card: CardRecord): EpochSeconds {
  return card.task.completedAt ?? Math.max(card.task.createdAt, ...card.runs.map((r) => r.endedAt ?? r.startedAt));
}

function participants(cards: ReadonlyArray<CardRecord>, chair: string | null): string[] {
  const all = [
    ...cards.map((c) => c.task.assignee),
    ...cards.flatMap((c) => c.runs.map((r) => r.profile)),
    ...cards.flatMap((c) => c.comments.map((x) => x.author)),
  ].filter((p): p is string => isBotProfile(p));
  const ordered = chair && all.includes(chair) ? [chair, ...all] : all;
  return [...new Set(ordered)];
}

type Draft = { id: string; kind: AgentMeeting['kind']; title: string; roomId: string; chair: string | null; opened: Line; ref: (c: CardRecord) => string };

function assemble(cards: ReadonlyArray<CardRecord>, d: Draft): Built {
  const agenda = cards.map((c) => ({
    taskId: c.task.id, title: d.kind === 'council' ? agendaTitle(c.task.title) : clip(c.task.title, TITLE_MAX),
    ...(isBotProfile(c.task.assignee) ? { ownerAgentId: c.task.assignee } : {}), status: agendaStatus(c.task.status),
  }));
  const status = meetingStatus(agenda.map((a) => a.status));
  const startS = Math.min(...cards.map(firstStart));
  const endS = status === 'adjourned' ? Math.max(...cards.map(lastEnd)) : null;
  const closed: Line[] = endS === null ? [] : [{ at: toIso(endS), kind: 'closed', text: 'Adjourned' }];
  const all = [d.opened, ...cards.flatMap((c) => cardLines(c, d.ref(c))), ...closed].sort(byTimeThenKind);
  const lines = all.slice(-MAX_LINES);
  const lastS = Math.max(endS ?? 0, ...all.map((l) => Date.parse(l.at) / 1000));
  return {
    startS, lastS,
    meeting: {
      id: d.id, kind: d.kind, title: d.title, roomId: d.roomId, status, startedAt: toIso(startS), ...(endS === null ? {} : { endedAt: toIso(endS) }),
      participantAgentIds: participants(cards, d.chair), agenda, lines, ...(all.length > lines.length ? { truncated: true } : {}),
    },
  };
}

function agendaTitle(title: string): string {
  return clip(title.replace(COUNCIL_TITLE, ''), TITLE_MAX) || 'Council item';
}

function councilMeeting(cards: ReadonlyArray<CardRecord>): Built {
  const first = cards[0] as CardRecord;
  const date = councilDate(first.task.title);
  const items = cards.length === 1 ? '1 item' : `${cards.length} items`;
  return assemble(cards, {
    id: `council-${first.task.id}`, kind: 'council', title: date ? `Council ${date}` : 'Council session', roomId: 'council',
    chair: roomById('council')?.leadProfile ?? null,
    opened: { at: toIso(first.task.createdAt), kind: 'opened', ...who('council'), text: `Session opened with ${items} on the agenda` },
    ref: (c) => `“${agendaTitle(c.task.title)}”`,
  });
}

function sharedMeeting(info: TaskInfo, card: CardRecord): Built {
  return assemble([card], {
    id: `task-${info.task.id}`, kind: 'shared-task', title: clip(info.task.title, TITLE_MAX), roomId: info.roomId ?? 'ops', chair: null,
    opened: { at: toIso(info.task.createdAt), kind: 'opened', ...who(info.task.createdBy), text: 'Card opened' },
    ref: () => '',
  });
}

export function buildMeetings(records: MeetingRecords, roomChats: ReadonlyArray<RoomChat>, period: Period): AgentMeeting[] {
  const infos = annotateTasks({ tasks: records.tasks, runs: records.runs, subs: records.subs, links: records.links }, roomChats);
  const card = cardsOf(records);
  const council = sessions(infos.filter((i) => i.task.createdBy === 'council')).map((group) => councilMeeting(group.map(card)));
  const shared = infos.filter((i) => i.shared && i.task.createdBy !== 'council').map((i) => sharedMeeting(i, card(i)));
  return [...council, ...shared]
    .filter((b) => b.startS < period.to && b.lastS >= period.from)
    .sort((a, b) => b.startS - a.startS || (a.meeting.id < b.meeting.id ? -1 : 1))
    .slice(0, MAX_MEETINGS)
    .map((b) => b.meeting);
}
