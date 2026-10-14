// The live timeline and usage reads for the hermes adapter: ~/.hermes READ-ONLY, one bot profile at a time.
// Sources: profiles/<p>/state.db (sessions, messages, tool calls, session_model_usage), kanban.db (cards, runs),
// profiles/<p>/cron/{executions.db, jobs.json} and profiles/<p>/logs/errors.log. Any unreadable part comes back
// empty (and is logged without detail that could hold secrets); an unknown profile is null.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { EpochSeconds } from './types.ts';
import type { HermesActivity, HermesActivitySource } from './activityTypes.ts';
import { readMessages, readSessions, readToolBursts } from './stateActivity.ts';
import { readModelUsage } from './usageReader.ts';
import { readAssignedTasks, readRuns } from './kanbanActivity.ts';
import { readCronRuns } from './cronRuns.ts';
import { parseErrorLines, readTail } from './errorLog.ts';
import { parseCronJobs } from './parseMisc.ts';
import { withReadOnlyDb } from './sqlite.ts';
import { isBotProfile } from '../roster.ts';
import { log, redact } from '../log.ts';

export type LiveActivityOptions = { readonly hermesHome: string };

function attempt<T>(label: string, fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (error) {
    log('hermes.read_failed', { source: label, detail: redact(error instanceof Error ? error.message : String(error)) });
    return fallback;
  }
}

export function createLiveActivity(opts: LiveActivityOptions): HermesActivitySource {
  const file = (profile: string, ...parts: string[]) => path.join(opts.hermesHome, 'profiles', profile, ...parts);

  function jobNames(profile: string): ReadonlyMap<string, string> {
    return attempt(`cron:${profile}:names`, () => {
      try {
        return new Map(parseCronJobs(profile, JSON.parse(readFileSync(file(profile, 'cron', 'jobs.json'), 'utf8'))).map((j) => [j.id, j.name]));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return new Map<string, string>();
        throw error;
      }
    }, new Map<string, string>());
  }

  async function readActivity(profile: string, since: EpochSeconds, limit: number): Promise<HermesActivity | null> {
    if (!isBotProfile(profile)) return null;
    const state = file(profile, 'state.db');
    const kanban = path.join(opts.hermesHome, 'kanban.db');
    const fromState = attempt(`state.db:${profile}:activity`, () => withReadOnlyDb(state, (db) => ({
      sessions: readSessions(db, since, limit), messages: readMessages(db, since, limit), tools: readToolBursts(db, since, limit),
    })), null);
    const fromKanban = attempt('kanban.db:activity', () => withReadOnlyDb(kanban, (db) => ({
      tasks: readAssignedTasks(db, profile, since, limit), runs: readRuns(db, profile, since, limit),
    })), null);
    const names = jobNames(profile);
    const cron = attempt(`cron:${profile}:runs`, () => withReadOnlyDb(file(profile, 'cron', 'executions.db'), (db) => readCronRuns(db, names, since, limit)), null);
    const errorsText = attempt(`errors.log:${profile}`, () => readTail(file(profile, 'logs', 'errors.log')), null);
    return {
      sessions: fromState?.sessions ?? [], messages: fromState?.messages ?? [], tools: fromState?.tools ?? [],
      tasks: fromKanban?.tasks ?? [], runs: fromKanban?.runs ?? [],
      cron: cron ?? [],
      errors: errorsText ? parseErrorLines(errorsText, since, limit) : [],
    };
  }

  async function readUsage(profile: string, from: EpochSeconds, to: EpochSeconds) {
    if (!isBotProfile(profile)) return null;
    return attempt(`state.db:${profile}:usage`, () => withReadOnlyDb(file(profile, 'state.db'), (db) => readModelUsage(db, from, to)), null);
  }

  return { readActivity, readUsage };
}
