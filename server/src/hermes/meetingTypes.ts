// What the Hermes seam reads from kanban.db for Conference Room minutes (HermesSource.readMeetingRecords): the cards
// that can be meetings (council cards, cards with a room subscription or a link, cards made from the OS) active in a
// period, with their runs (and result summaries), comments and status-change events. Same invariants as types.ts:
// chat ids are opaque keys; free text (titles, comments, summaries, block reasons) is scrubbed later, in the domain.
import type { EpochSeconds, KanbanLink, KanbanRun, KanbanSub, KanbanTask } from './types.ts';

export type MeetingRun = KanbanRun & { readonly summary: string | null };

export type KanbanComment = {
  readonly taskId: string;
  readonly author: string; // a profile key, 'user', 'worker', ...
  readonly body: string;
  readonly createdAt: EpochSeconds;
};

export type KanbanEvent = {
  readonly taskId: string;
  readonly kind: string; // claimed|completed|blocked|crashed|timed_out|gave_up|reclaimed|promoted|dependency_wait|archived
  readonly createdAt: EpochSeconds;
  readonly profile: string | null; // the run's profile, when the event belongs to a run
  readonly reason: string | null; // blocked: the reason given
};

export type MeetingRecords = {
  readonly tasks: ReadonlyArray<KanbanTask>;
  readonly runs: ReadonlyArray<MeetingRun>;
  readonly subs: ReadonlyArray<KanbanSub>;
  readonly links: ReadonlyArray<KanbanLink>;
  readonly comments: ReadonlyArray<KanbanComment>;
  readonly events: ReadonlyArray<KanbanEvent>;
};

/** Status-change event kinds that make it into the minutes (heartbeats, spawns and attachments don't). */
export const MINUTES_EVENT_KINDS: ReadonlyArray<string> = Object.freeze([
  'claimed', 'completed', 'blocked', 'crashed', 'timed_out', 'gave_up', 'reclaimed', 'promoted', 'dependency_wait', 'archived',
]);
