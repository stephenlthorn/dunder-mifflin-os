// Which Hermes kanban cards wait on you, as approvals, and the `hermes kanban` commands each button runs. Pure.
//
//  card                                   asks            Approve                         Reject
//  blocked, a bot's (needs_input, ...)    question/...    unblock --reason=<note>         comment + archive
//  blocked, a person's or nobody's        task (to-do)    complete --result=<note>        comment + archive
//  review, no bot to review it            task            complete --result=<note>        reopen-review --reason=<note>
//  triage after an unblock loop           question        (shown only: fix the cause in Hermes)
//
// Not listed: review cards a bot reviews (Hermes dispatches the assignee with its review skill), plain triage cards
// (the decomposer's) and dependency waits (they resume on their own). Ids are '<card id>.<status>', so a decision
// on a card that has moved on since is refused instead of running the wrong command.
import type { ApprovalDecision, ApprovalRequest } from '../adapters/types.ts';
import { AGENT_ID } from '../adapters/types.ts';
import type { KanbanWaiting } from '../hermes/types.ts';
import { isBotProfile } from '../roster.ts';
import { scrubText } from './scrub.ts';

const CARD_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const STATUSES: ReadonlySet<string> = new Set(['blocked', 'review', 'triage']);
const OS = 'in Dunder Mifflin OS';
const DETAIL_MAX = 600;

type Shape = 'bot-blocked' | 'todo' | 'review' | 'loop';

const ARCHIVE = 'Archive the card';
const ACTIONS: Readonly<Record<Exclude<Shape, 'loop'>, { approve: string; reject: string }>> = {
  'bot-blocked': { approve: 'Unblock it (your note goes on the card)', reject: ARCHIVE },
  todo: { approve: 'Mark it done', reject: ARCHIVE },
  review: { approve: 'Accept it and mark it done', reject: 'Send it back with your note' },
};

const isBot = (profile: string | null): boolean => profile !== null && isBotProfile(profile);

function shapeOf(card: KanbanWaiting): Shape | null {
  if (!CARD_ID.test(card.id)) return null;
  if (card.status === 'triage') return card.event === 'block_loop_detected' ? 'loop' : null;
  if (card.status === 'review') return isBot(card.assignee) ? null : 'review';
  if (card.blockKind === 'dependency') return null;
  return isBot(card.assignee) ? 'bot-blocked' : 'todo';
}

/** Who is asking: the bot it's assigned to, else whoever made the card, else the board itself. */
function askerOf(card: KanbanWaiting): string {
  if (isBot(card.assignee)) return card.assignee!;
  return card.createdBy && AGENT_ID.test(card.createdBy) ? card.createdBy : 'kanban';
}

function kindOf(card: KanbanWaiting, shape: Shape): ApprovalRequest['kind'] {
  if (shape === 'loop') return 'question';
  if (shape !== 'bot-blocked') return 'task';
  if (card.blockKind === 'needs_input') return 'question';
  return card.blockKind === 'capability' ? 'permission' : 'task';
}

function riskOf(card: KanbanWaiting, shape: Shape): NonNullable<ApprovalRequest['risk']> {
  if (shape === 'todo' || shape === 'review') return 'low';
  return card.blockKind === 'capability' ? 'high' : 'medium';
}

function detailOf(card: KanbanWaiting): string | undefined {
  const text = (card.reason ?? card.comment ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return undefined;
  const clean = scrubText(text);
  return clean.length > DETAIL_MAX ? `${clean.slice(0, DETAIL_MAX - 1)}…` : clean;
}

export function hermesApprovals(cards: ReadonlyArray<KanbanWaiting>): ApprovalRequest[] {
  return cards.flatMap((card): ApprovalRequest[] => {
    const shape = shapeOf(card);
    if (!shape) return [];
    const detail = detailOf(card);
    return [{
      id: `${card.id}.${card.status}`, agentId: askerOf(card), kind: kindOf(card, shape), title: scrubText(card.title),
      ...(detail ? { detail } : {}), requestedAt: new Date(card.since * 1000).toISOString(), risk: riskOf(card, shape),
      decidable: shape !== 'loop', ...(shape === 'loop' ? {} : { actions: ACTIONS[shape] }),
    }];
  });
}

const said = (verb: string, note?: string): string => (note ? `${verb} ${OS}: ${note}` : `${verb} ${OS}`);

/** The argv lists (after the hermes binary) a decision runs, in order; null when the card can't be decided here. */
export function decisionCommands(card: KanbanWaiting, d: ApprovalDecision): string[][] | null {
  const shape = shapeOf(card);
  if (!shape || shape === 'loop') return null;
  const id = card.id;
  const archive = [['kanban', 'comment', id, said('Rejected', d.note)], ['kanban', 'archive', id]]; // text starts with a word, never a dash
  switch (shape) {
    case 'bot-blocked':
      return d.approve ? [['kanban', 'unblock', id, `--reason=${said('Approved', d.note)}`]] : archive;
    case 'todo':
      return d.approve ? [['kanban', 'complete', id, `--result=${said('Done', d.note)}`]] : archive;
    case 'review':
      return d.approve
        ? [['kanban', 'complete', id, `--result=${said('Accepted', d.note)}`]]
        : [['kanban', 'reopen-review', id, `--reason=${said('Changes requested', d.note)}`]];
  }
}

export function parseHermesApprovalId(id: string): { taskId: string; status: KanbanWaiting['status'] } | null {
  const dot = id.lastIndexOf('.');
  const taskId = id.slice(0, dot);
  const status = id.slice(dot + 1);
  if (dot < 1 || !CARD_ID.test(taskId) || !STATUSES.has(status)) return null;
  return { taskId, status: status as KanbanWaiting['status'] };
}
