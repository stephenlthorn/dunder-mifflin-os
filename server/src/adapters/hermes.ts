// The `hermes` adapter: today's Hermes code behind the adapter contract. It reads ~/.hermes READ-ONLY through a
// HermesSource (live files, or the recorded fixture for tests and demo mode), chats with `hermes chat`, creates
// shared cards with `hermes kanban create`, answers the cards that wait on you (chat/approvalService.ts) and runs the
// control verbs stop / run job now / reassign (chat/controlService.ts). Agents are profile keys; rooms keep their historical ids (ops, council,
// dm-<profile>) so the Hermes chat sessions (dmos-<room>) carry on. Timeline and usage come from the source's
// activity reads (hermes/liveActivity.ts or the recorded fixtures/hermes-activity.json). Meetings: minutes built
// from kanban.db (no LLM).
import type { EpochSeconds, HermesSource } from '../hermes/types.ts';
import type { Runner } from '../chat/runner.ts';
import { createChatService } from '../chat/chatService.ts';
import { createTaskService } from '../chat/taskService.ts';
import { createApprovalService } from '../chat/approvalService.ts';
import { createHermesControls } from '../chat/controlService.ts';
import { buildHermesSnapshot, roomChatsOf } from '../domain/snapshot.ts';
import { collectRoomMessages } from '../domain/roomMessages.ts';
import { buildMeetings } from '../domain/minutes.ts';
import { HERMES_SUMMARY } from '../domain/hermesSummary.ts';
import { roomById } from '../rooms.ts';
import { createStateCache } from '../http/stateCache.ts';
import { CHAT_TIMEOUT_MS, CRON_RUN_TIMEOUT_MS, KANBAN_TIMEOUT_MS } from '../config.ts';
import { hermesTimeline } from '../domain/hermesTimeline.ts';
import { isBotProfile } from '../roster.ts';
import type { AgentAdapter } from './types.ts';

export type HermesAdapterOptions = {
  readonly id?: string;
  readonly source: HermesSource;
  readonly runner: Runner;
  readonly hermesBin: string;
  readonly now?: () => EpochSeconds;
  readonly cacheTtlMs?: number;
  readonly jobEarlyMs?: number; // how long "run now" waits for a job before answering "started" (tests: short)
};

const CACHE_TTL_MS = 2000;

export function createHermesAdapter(opts: HermesAdapterOptions): AgentAdapter {
  const now = opts.now ?? (() => Date.now() / 1000);
  const cache = createStateCache(opts.source, opts.cacheTtlMs ?? CACHE_TTL_MS);
  const chat = createChatService({ runner: opts.runner, hermesBin: opts.hermesBin, timeoutMs: CHAT_TIMEOUT_MS });
  const tasks = createTaskService({ runner: opts.runner, hermesBin: opts.hermesBin, timeoutMs: KANBAN_TIMEOUT_MS });
  const approvals = createApprovalService({
    runner: opts.runner, hermesBin: opts.hermesBin, timeoutMs: KANBAN_TIMEOUT_MS, readFresh: () => opts.source.readState(),
  });
  const snapshot = async () => buildHermesSnapshot(await cache.get(), now());
  const controls = createHermesControls({
    runner: opts.runner, hermesBin: opts.hermesBin, timeoutMs: KANBAN_TIMEOUT_MS, jobTimeoutMs: CRON_RUN_TIMEOUT_MS,
    ...(opts.jobEarlyMs === undefined ? {} : { earlyMs: opts.jobEarlyMs }), readFresh: () => opts.source.readState(),
  });
  const thenFresh = async <T>(work: Promise<T>): Promise<T> => {
    const out = await work;
    cache.invalidate();
    return out;
  };

  return {
    ...HERMES_SUMMARY,
    id: opts.id ?? HERMES_SUMMARY.id,
    snapshot,
    invalidate: () => cache.invalidate(),
    readMessages: async (roomId, limit) => {
      if (!roomById(roomId)) return null;
      return collectRoomMessages(opts.source, roomId, roomChatsOf(await cache.get()), limit);
    },
    meetings: async (period) => {
      const records = (await opts.source.readMeetingRecords?.(period)) ?? null;
      return records ? buildMeetings(records, roomChatsOf(await cache.get()), period) : [];
    },
    chat: async (roomId, text) => {
      const result = await chat.send(roomId, text);
      return result.ok ? { ok: true, value: result.messages } : result;
    },
    createTask: async (input) => {
      const result = await tasks.create({ roomId: input.roomId, title: input.title, assignee: input.assigneeAgentId });
      return result.ok ? { ok: true, value: result.task } : result;
    },
    timeline: async (agentId, query) => {
      const since = Date.parse(query.since) / 1000;
      if (!isBotProfile(agentId) || !opts.source.readActivity || !Number.isFinite(since)) return null;
      const activity = await opts.source.readActivity(agentId, since, query.limit);
      return activity ? hermesTimeline(activity, { since, limit: query.limit }) : null;
    },
    usage: async (agentId, window) => {
      if (!isBotProfile(agentId) || !opts.source.readUsage) return null;
      const models = await opts.source.readUsage(agentId, Date.parse(window.from) / 1000, Date.parse(window.to) / 1000);
      return models ? { models } : null;
    },
    listApprovals: async () => (await snapshot()).approvals ?? [],
    // control verbs (chat/controlService.ts); no pause/resume: Hermes has no safe per-profile pause
    stop: (agentId, target) => thenFresh(controls.stop(agentId, target)),
    runJob: (agentId, jobId) => thenFresh(controls.runJob(agentId, jobId)),
    reassign: (agentId, taskId, toAgentId) => thenFresh(controls.reassign(agentId, taskId, toAgentId)),
    resolveApproval: async (id, decision) => {
      const result = await approvals.resolve(id, decision);
      cache.invalidate();
      return result;
    },
  };
}
