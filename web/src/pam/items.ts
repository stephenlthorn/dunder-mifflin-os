// Everything Ask Pam can find, built from a snapshot: people, chats with bots, rooms, places, tasks, scheduled jobs and actions.
import type { OfficeSnapshot, Person, Room, Task } from '@shared/contract';
import type { ControlRequest } from '@shared/controls';
import { AREAS, SEATS } from '@shared/office';
import { areaRooms } from '../map/mapModel';
import { MINUTES_TAB } from '../chrome/windows/windowState';
import { FILTERS, FILTER_META, type FleetFilter } from '../office/filters';
import { shortName } from '../office/names';
import { type AnyStatus, presenceFor, statusWord } from '../office/status';
import { controlItems } from './controlItems';

export type PamKind = 'person' | 'bot' | 'timeline' | 'room' | 'place' | 'action' | 'task' | 'job' | 'control';
export type ViewMode = 'map' | 'list';
export type PamAction =
  | { type: 'open-person'; personId: string }
  | { type: 'chat'; personId: string }
  | { type: 'open-area'; areaId: string; roomId?: string }
  | { type: 'show-person'; personId: string }
  | { type: 'show-area'; areaId: string }
  | { type: 'filter'; filter: FleetFilter }
  | { type: 'view'; view: ViewMode }
  | { type: 'calendar' }
  | { type: 'shortcuts' }
  | { type: 'settings' }
  | { type: 'ledger' } // Angela's ledger: tokens and cost per bot
  | { type: 'timeline'; personId: string } // their window on the Timeline tab
  | { type: 'control'; personId: string; request: ControlRequest } // their window, with the verb's confirmation open
  | { type: 'dundies' } // the weekly awards (delight/pamItems.ts)
  | { type: 'creed' }; // Creed's corner

/** `fields`: searchable text with a weight (the label is always the first field, weight 1). */
export type PamItem = {
  id: string;
  kind: PamKind;
  label: string;
  detail: string;
  fields: readonly (readonly [string, number])[];
  action: PamAction;
  alt?: PamAction; // Shift+Enter: show on the map
  personId?: string; // draws their mini portrait
  status?: AnyStatus;
};
/** `writable`: the server allows writes (demo mode counts as yes); without it there are no "Chat with …" items. */
export type PamContext = { filter: FleetFilter; view: ViewMode; writable: boolean };

const TASK_LABEL: Record<Task['status'], string> = { todo: 'To do', doing: 'Doing', blocked: 'Blocked', done: 'Done' };
const areaName = (id: string) => AREAS.find((a) => a.id === id)?.name ?? id;

/** Hermes-era data has no capability flags: those bots can chat. */
const botCanChat = (p: Person) => p.bot?.capabilities?.chat ?? true;

function personItems(s: OfficeSnapshot, p: Person, deskArea: string, writable: boolean): PamItem[] {
  const presence = presenceFor(p, s.presence);
  const show: PamAction = { type: 'show-person', personId: p.id };
  if (!p.bot) {
    return [{ id: `person:${p.id}`, kind: 'person', label: p.name, detail: `${p.title} · no bot yet`, personId: p.id, status: 'no-bot',
      fields: [[p.name, 1], [p.title, 0.7], [deskArea, 0.5]], action: { type: 'open-person', personId: p.id }, alt: show }];
  }
  const activity = presence.activity ? ` — ${presence.activity}` : '';
  const person: PamItem = {
    id: `person:${p.id}`, kind: 'person', label: p.name, personId: p.id, status: presence.status,
    detail: `${p.bot.profile} · ${statusWord(presence.status)}${activity}`,
    fields: [[p.name, 1], [p.bot.profile, 0.8], [p.bot.role, 0.7], [p.title, 0.7], [statusWord(presence.status), 0.6],
      [deskArea, 0.5], [presence.activity ?? '', 0.5], [p.persona ?? '', 0.8]],
    action: { type: 'open-person', personId: p.id }, alt: show,
  };
  const first = shortName(p.name);
  const timeline: PamItem = {
    id: `timeline:${p.id}`, kind: 'timeline', label: `Timeline: ${first}`, detail: `${p.bot.profile} · what ${first} did, and today in one paragraph`,
    personId: p.id, // no status: the s: filter finds people and chats, not their timelines
    fields: [[`Timeline: ${first}`, 1], [p.name, 0.8], [p.bot.profile, 0.6], ['activity history log documentary', 0.4]],
    action: { type: 'timeline', personId: p.id }, alt: show,
  };
  if (!writable || !botCanChat(p)) return [person, timeline];
  const bot: PamItem = {
    id: `bot:${p.id}`, kind: 'bot', label: `Chat with ${first}`, detail: `${p.bot.profile} · Direct line`, personId: p.id,
    status: presence.status, fields: [[`Chat with ${first}`, 1], [p.name, 0.8], [p.bot.profile, 0.7], [p.bot.role, 0.6]],
    action: { type: 'chat', personId: p.id }, alt: show,
  };
  return [person, bot, timeline];
}

function roomItem(s: OfficeSnapshot, r: Room): PamItem {
  const lead = s.people.find((p) => p.id === r.memberIds[0]);
  const members = r.memberIds.flatMap((id) => s.people.filter((p) => p.id === id).map((p) => p.name)).join(' ');
  return {
    id: `room:${r.id}`, kind: 'room', label: `${r.name} room`, detail: `${areaName(r.areaId)}${lead ? ` · Lead: ${shortName(lead.name)}` : ''}`,
    fields: [[`${r.name} room`, 1], [areaName(r.areaId), 0.8], [members, 0.5]],
    action: { type: 'open-area', areaId: r.areaId, roomId: r.id }, alt: { type: 'show-area', areaId: r.areaId },
  };
}

function taskItem(s: OfficeSnapshot, t: Task): PamItem {
  const owner = s.people.find((p) => p.id === t.ownerId);
  const room = s.rooms.find((r) => r.id === t.roomId);
  const ownerName = owner ? shortName(owner.name) : '';
  const action: PamAction = room && room.kind !== 'dm'
    ? { type: 'open-area', areaId: room.areaId, roomId: room.id }
    : owner ? { type: 'open-person', personId: owner.id } : { type: 'open-area', areaId: 'conference', roomId: 'ops' };
  return {
    id: `task:${t.id}`, kind: 'task', label: t.title, detail: [TASK_LABEL[t.status], ownerName, room?.name].filter(Boolean).join(' · '),
    fields: [[t.title, 1], [ownerName, 0.6], [room?.name ?? '', 0.5]], action,
    ...(owner ? { alt: { type: 'show-person', personId: owner.id } as PamAction, personId: owner.id } : {}),
  };
}

function jobItems(s: OfficeSnapshot): PamItem[] {
  return Object.entries(s.jobs ?? {}).flatMap(([personId, jobs]) => {
    const owner = s.people.find((p) => p.id === personId);
    if (!owner) return [];
    const ownerName = shortName(owner.name);
    return jobs.map((j, i): PamItem => ({
      id: `job:${personId}:${i}`, kind: 'job', label: j.name, detail: `${ownerName} · ${j.schedule}${j.enabled ? '' : ' · paused'}`,
      fields: [[j.name, 1], [ownerName, 0.6], [j.schedule, 0.4]], personId,
      action: { type: 'open-person', personId }, alt: { type: 'show-person', personId },
    }));
  });
}

const action = (id: string, label: string, detail: string, act: PamAction, extra = ''): PamItem =>
  ({ id: `action:${id}`, kind: 'action', label, detail, fields: [[label, 1], [extra, 0.8]], action: act });

function actionItems(s: OfficeSnapshot, ctx: PamContext): PamItem[] {
  const conference = areaRooms(s.rooms, 'conference').length > 0
    ? action('conference', 'Open the Conference Room', 'Ops and Council: shared tasks', { type: 'open-area', areaId: 'conference' }, 'meeting ops council')
    : action('conference', 'Show the Conference Room', 'On the map', { type: 'show-area', areaId: 'conference' }, 'meeting');
  const filters = FILTERS.map((f) => {
    const on = ctx.filter === f;
    return action(`filter-${f}`, FILTER_META[f].only.replace('Showing', 'Show'), on ? 'On — choose to show everyone' : 'Fleet filter',
      { type: 'filter', filter: on ? 'all' : f }, `filter ${FILTER_META[f].label}`);
  });
  const everyone = ctx.filter === 'all' ? [] : [action('filter-all', 'Show everyone', 'Clear the fleet filter', { type: 'filter', filter: 'all' }, 'filter clear')];
  const view = ctx.view === 'map'
    ? action('view', 'Switch to the list view', 'Everyone by room, phone-friendly', { type: 'view', view: 'list' }, 'mobile')
    : action('view', 'Switch to the map', 'The office floor plan', { type: 'view', view: 'map' }, 'floor plan');
  const ledger = action('ledger', 'Open Angela’s ledger', 'Tokens and estimated cost per bot', { type: 'ledger' }, 'usage cost tokens spend budget accounting money');
  const minutes = areaRooms(s.rooms, 'conference').length > 0
    ? [action('minutes', 'Read the Conference Room minutes', 'Council sessions and shared tasks, as memos',
      { type: 'open-area', areaId: 'conference', roomId: MINUTES_TAB }, 'minutes meetings memo council')]
    : [];
  const calendar = action('calendar', 'Open the Party Planning Committee calendar', 'Every scheduled job, by week or day',
    { type: 'calendar' }, 'calendar schedule cron jobs ppc');
  return [
    conference, ...minutes, calendar, ledger, ...filters, ...everyone, view,
    action('shortcuts', 'Keyboard shortcuts', 'Press ? any time', { type: 'shortcuts' }, 'keys help'),
    action('settings', 'Settings', 'Notifications, chime, shortcuts, motion', { type: 'settings' }, 'preferences gear'),
  ];
}

const deskAreaName = (seatId: string) => areaName(SEATS.find((seat) => seat.id === seatId)?.areaId ?? '');

export function buildPamItems(s: OfficeSnapshot, ctx: PamContext): PamItem[] {
  const people = s.people.flatMap((p) => personItems(s, p, deskAreaName(p.seatId), ctx.writable));
  const rooms = s.rooms.filter((r) => r.kind !== 'dm').map((r) => roomItem(s, r));
  const places = AREAS.filter((a) => areaRooms(s.rooms, a.id).length === 0).map((a): PamItem => ({
    id: `place:${a.id}`, kind: 'place', label: a.name, detail: 'Show on the map', fields: [[a.name, 1]], action: { type: 'show-area', areaId: a.id },
  }));
  return [
    ...people.filter((i) => i.kind === 'person'), ...people.filter((i) => i.kind === 'bot'), ...people.filter((i) => i.kind === 'timeline'), ...rooms, ...places,
    ...actionItems(s, ctx), ...s.tasks.map((t) => taskItem(s, t)), ...jobItems(s), ...controlItems(s, ctx.writable),
  ];
}
