// The lines of Conference Room minutes for one card, in plain words, from what the kanban record holds: status-change
// events (or, for cards without events, their runs), comments and run result summaries. No LLM. Free text is
// scrubbed (scrub.ts) BEFORE it is clipped, so a secret can't survive half-cut.
import type { AgentMeeting } from '../adapters/types.ts';
import type { KanbanTask } from '../hermes/types.ts';
import type { KanbanComment, KanbanEvent, MeetingRun } from '../hermes/meetingTypes.ts';
import { isBotProfile } from '../roster.ts';
import { OS_CREATOR_PREFIX } from './tasks.ts';
import { toIso } from './presence.ts';
import { scrubText } from './scrub.ts';

export type Line = AgentMeeting['lines'][number];
export type CardRecord = {
  readonly task: KanbanTask;
  readonly runs: ReadonlyArray<MeetingRun>;
  readonly comments: ReadonlyArray<KanbanComment>;
  readonly events: ReadonlyArray<KanbanEvent>;
};

export const COMMENT_MAX = 280;
export const RESULT_MAX = 400;
const REASON_MAX = 200;
export const TITLE_MAX = 160;
const AUTHOR_MAX = 40;

export function clip(text: string, max: number): string {
  const clean = scrubText(text).replace(/\s+/g, ' ').trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

/** Who wrote or did something: a bot (by agent id) or a plain label. */
export function who(author: string | null | undefined): Pick<Line, 'authorAgentId' | 'author'> {
  if (!author) return {};
  const bot: unknown = author; // isBotProfile narrows `unknown`; asking about the string itself would narrow it to never
  if (isBotProfile(bot)) return { authorAgentId: bot };
  if (author === 'user') return { author: 'You' };
  if (author === 'council') return { author: 'Council' };
  if (author.startsWith(OS_CREATOR_PREFIX)) return { author: 'Dunder Mifflin OS' };
  return { author: clip(author, AUTHOR_MAX) };
}

type Phrase = { readonly kind: Line['kind']; readonly text: (ref: string) => string };
const said = (plain: string, withRef: (ref: string) => string): Phrase['text'] => (ref) => (ref ? withRef(ref) : plain);
const PHRASES: Readonly<Record<string, Phrase>> = {
  claimed: { kind: 'started', text: said('Picked it up', (r) => `Picked up ${r}`) },
  completed: { kind: 'status', text: said('Finished', (r) => `Finished ${r}`) },
  crashed: { kind: 'status', text: said('The run crashed', (r) => `The run on ${r} crashed`) },
  timed_out: { kind: 'status', text: said('The run timed out', (r) => `The run on ${r} timed out`) },
  gave_up: { kind: 'status', text: said('Gave up after repeated failures', (r) => `Gave up on ${r} after repeated failures`) },
  reclaimed: { kind: 'status', text: said('The run was reclaimed', (r) => `The run on ${r} was reclaimed`) },
  promoted: { kind: 'status', text: said('Ready to start', (r) => `${r} is ready to start`) },
  dependency_wait: { kind: 'status', text: said('Waiting on another card', (r) => `${r} is waiting on another card`) },
  archived: { kind: 'status', text: said('Archived', (r) => `${r} archived`) },
  blocked: { kind: 'status', text: said('Blocked', (r) => `${r} blocked`) },
};
const OUTCOME_EVENT: Readonly<Record<string, string>> = {
  completed: 'completed', crashed: 'crashed', timed_out: 'timed_out', gave_up: 'gave_up', reclaimed: 'reclaimed', blocked: 'blocked',
};

function eventLine(e: KanbanEvent, ref: string): Line | null {
  const phrase = PHRASES[e.kind];
  if (!phrase) return null;
  const base = phrase.text(ref);
  const text = e.kind === 'blocked' && e.reason ? `${base}: ${clip(e.reason, REASON_MAX)}` : base;
  return { at: toIso(e.createdAt), kind: phrase.kind, ...who(e.profile), text };
}

/** For cards without events (older Hermes, recorded fixtures): what the runs say. */
function runLines(r: MeetingRun, ref: string): Line[] {
  const start: Line = { at: toIso(r.startedAt), kind: 'started', ...who(r.profile), text: (PHRASES.claimed as Phrase).text(ref) };
  if (r.endedAt === null) return [start];
  const phrase = PHRASES[OUTCOME_EVENT[r.outcome ?? r.status] ?? ''];
  const text = phrase ? phrase.text(ref) : `The run ended (${clip(r.outcome ?? r.status, 30)})`;
  return [start, { at: toIso(r.endedAt), kind: 'status', ...who(r.profile), text }];
}

/** Every line one card contributes. `ref` names the card ("“round 1 cmo”") when a meeting has several. */
export function cardLines(card: CardRecord, ref: string): Line[] {
  const status = card.events.length > 0
    ? card.events.flatMap((e) => eventLine(e, ref) ?? [])
    : card.runs.flatMap((r) => runLines(r, ref));
  const results = card.runs.flatMap((r): Line[] => {
    const summary = r.summary ? clip(r.summary, RESULT_MAX) : '';
    return summary ? [{ at: toIso(r.endedAt ?? r.lastHeartbeatAt ?? r.startedAt), kind: 'result', ...who(r.profile), text: summary }] : [];
  });
  const comments = card.comments.flatMap((c): Line[] => {
    const text = clip(c.body, COMMENT_MAX);
    return text ? [{ at: toIso(c.createdAt), kind: 'comment', ...who(c.author), text }] : [];
  });
  return [...status, ...results, ...comments];
}

const KIND_ORDER: Readonly<Record<Line['kind'], number>> = { opened: 0, started: 1, comment: 2, result: 3, status: 4, closed: 5 };

export function byTimeThenKind(a: Line, b: Line): number {
  if (a.at !== b.at) return a.at < b.at ? -1 : 1;
  return KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
}
