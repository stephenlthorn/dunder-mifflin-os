// Scrubs a live HermesState into fixture data: keeps structure, statuses and timestamps; replaces every id,
// title and name that could identify real work, people or chats with synthetic values.
import type { HermesState, KanbanState, TelegramRoomConfig } from '../src/hermes/types.ts';
import { deriveRoomChats } from '../src/domain/roomChats.ts';
import { isBotProfile } from '../src/roster.ts';
import { roomById } from '../src/rooms.ts';

const TASK_TITLES = [
  'Reconcile the paper invoices', 'Prep the quarterly sales deck', 'Order toner for the copier', 'Draft the client follow-up',
  'Plan the Dundies agenda', 'Audit the warehouse inventory', 'Update the price sheet', 'Write the safety training memo',
  'Schedule the party planning committee', 'Refresh the website banner', 'Review the expense reports', 'Call back the Scranton prospects',
  'Fix the conference room TV', 'Summarise the board meeting', 'Test the new phone system', 'Clean up the shared drive',
];
const CRON_NAMES = ['Morning report', 'Evening wrap-up', 'Weekly review', 'Inbox sweep', 'Nightly backup check', 'Lead digest', 'Health check', 'Friday briefing'];
const SESSION_TITLES: Readonly<Record<string, string>> = {
  telegram: 'Direct chat', kanban: 'Working a kanban card', cron: 'Scheduled job', cli: 'Terminal session',
};
const KEPT_CREATORS = new Set(['council', 'user', 'worker']);

export type Remap = (key: string) => string;

export function chatRemap(state: HermesState): Remap {
  const named = new Map(deriveRoomChats(state.telegram, state.chatNames).map((rc) => [rc.chatKey, `chat-${rc.roomId}`]));
  const others = new Map<string, string>();
  return (key) => named.get(key) ?? others.get(key) ?? (others.set(key, `chat-x${others.size + 1}`).get(key) as string);
}

function redactTelegram(configs: ReadonlyArray<TelegramRoomConfig>, chat: Remap): TelegramRoomConfig[] {
  return configs.map((c) => ({
    ...c,
    groupChats: c.groupChats.map(chat),
    leadChats: c.leadChats.map(chat),
    roomHints: Object.fromEntries(Object.entries(c.roomHints).map(([k, v]) => [chat(k), v])),
  }));
}

// Bot profiles stay; a person's name is dropped (a card for a person then reads as nobody's: still your to-do).
function keepAssignee(a: string | null): string | null {
  return a && isBotProfile(a) ? a : null;
}

function redactKanban(k: KanbanState, chat: Remap): KanbanState {
  const ids = new Map(k.tasks.map((t, i) => [t.id, `t_fx${String(i + 1).padStart(3, '0')}`]));
  const id = (taskId: string) => ids.get(taskId);
  return {
    tasks: k.tasks.map((t, i) => ({
      ...t, id: id(t.id) as string, title: TASK_TITLES[i % TASK_TITLES.length] as string, assignee: keepAssignee(t.assignee), tenant: null,
      createdBy: t.createdBy && (KEPT_CREATORS.has(t.createdBy) || t.createdBy.startsWith('dmos-')) ? t.createdBy : 'user',
    })),
    runs: k.runs.flatMap((r) => (id(r.taskId) ? [{ ...r, taskId: id(r.taskId) as string }] : [])),
    subs: k.subs.flatMap((s) => (id(s.taskId) ? [{ ...s, taskId: id(s.taskId) as string, chatKey: chat(s.chatKey) }] : [])),
    links: k.links.flatMap((l) => (id(l.parentId) || id(l.childId) ? [{
      parentId: id(l.parentId) ?? 't_fx_old', childId: id(l.childId) ?? 't_fx_old',
      parentAssignee: keepAssignee(l.parentAssignee), childAssignee: keepAssignee(l.childAssignee),
    }] : [])),
  };
}

export function redactState(state: HermesState): { state: HermesState } {
  const chat = chatRemap(state);
  const telegram = redactTelegram(state.telegram, chat);
  const chatNames = Object.fromEntries(Object.keys(state.chatNames).flatMap((k) => {
    const key = chat(k);
    const room = roomById(key.replace(/^chat-/, ''));
    return room ? [[key, `Dunder Mifflin ${room.name}`]] : [];
  }));
  return {
    state: {
      recordedAt: state.recordedAt,
      gateway: state.gateway,
      telegram,
      chatNames,
      kanban: redactKanban(state.kanban, chat),
      sessions: state.sessions.map((s) => ({ ...s, title: s.source ? (SESSION_TITLES[s.source] ?? null) : null })),
      cron: state.cron.map((j, i) => ({ ...j, id: `j${i + 1}`, name: CRON_NAMES[i % CRON_NAMES.length] as string })),
      personas: Object.fromEntries(Object.entries(state.personas).filter(([p]) => isBotProfile(p))),
    },
  };
}
