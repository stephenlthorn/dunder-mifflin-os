// What a bot DID (timeline) and what it USED (tokens), as read from ~/.hermes. Raw, unscrubbed records: they never
// leave the server as they are; domain/hermesTimeline.ts turns them into short, scrubbed timeline events.
// Message and error text is read at most ACTIVITY_TEXT_MAX characters long, and only a one-line summary goes out.
import type { ModelTokens } from '../adapters/types.ts';
import type { EpochSeconds } from './types.ts';

export const ACTIVITY_TEXT_MAX = 300;

export type SessionRecord = {
  readonly id: string;
  readonly source: string | null; // telegram|cli|api|subagent|... (cron and kanban sessions are covered by their runs)
  readonly startedAt: EpochSeconds;
  readonly endedAt: EpochSeconds | null;
  readonly endReason: string | null;
  readonly title: string | null;
  readonly messageCount: number | null;
};

export type MessageRecord = {
  readonly id: string;
  readonly source: string | null;
  readonly role: 'user' | 'assistant';
  readonly text: string; // first ACTIVITY_TEXT_MAX characters
  readonly at: EpochSeconds;
};

/** One session's tool calls in the window, folded into one event. */
export type ToolBurst = {
  readonly sessionId: string;
  readonly source: string | null;
  readonly count: number;
  readonly tools: ReadonlyArray<{ readonly name: string; readonly count: number }>; // most used first
  readonly lastAt: EpochSeconds;
};

export type TaskRecord = { readonly id: string; readonly title: string; readonly createdAt: EpochSeconds };

export type RunRecord = {
  readonly id: string;
  readonly taskId: string;
  readonly title: string;
  readonly outcome: string | null; // completed|blocked|crashed|timed_out|spawn_failed|gave_up|reclaimed|null (running)
  readonly status: string;
  readonly startedAt: EpochSeconds;
  readonly endedAt: EpochSeconds | null;
};

export type CronRunRecord = {
  readonly id: string;
  readonly jobId: string;
  readonly jobName: string | null;
  readonly ok: boolean;
  readonly at: EpochSeconds; // finished (or started) at
  readonly delivery: string | null; // delivered|suppressed|...
  readonly error: string | null; // first ACTIVITY_TEXT_MAX characters
};

export type LogErrorRecord = { readonly at: EpochSeconds; readonly logger: string; readonly message: string };

export type HermesActivity = {
  readonly sessions: ReadonlyArray<SessionRecord>;
  readonly messages: ReadonlyArray<MessageRecord>;
  readonly tools: ReadonlyArray<ToolBurst>;
  readonly tasks: ReadonlyArray<TaskRecord>; // cards assigned to the bot, created in the window
  readonly runs: ReadonlyArray<RunRecord>;
  readonly cron: ReadonlyArray<CronRunRecord>;
  readonly errors: ReadonlyArray<LogErrorRecord>;
};

export const EMPTY_ACTIVITY: HermesActivity = Object.freeze({ sessions: [], messages: [], tools: [], tasks: [], runs: [], cron: [], errors: [] });

/** One recorded usage row (the fixture keeps them per day and model; the live reader sums per model in SQL). */
export type UsageRecord = ModelTokens & { readonly at: EpochSeconds };

export interface HermesActivitySource {
  /** null = unknown profile. Unreadable parts come back empty. */
  readActivity(profile: string, since: EpochSeconds, limit: number): Promise<HermesActivity | null>;
  /** Tokens per model used in [from, to); null = no usage source for this profile (no state.db). */
  readUsage(profile: string, from: EpochSeconds, to: EpochSeconds): Promise<ReadonlyArray<ModelTokens> | null>;
}
