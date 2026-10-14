// The `live` adapter: reads ~/.hermes READ-ONLY. Sources: the open status API (or gateway_state.json), kanban.db,
// profiles/<p>/{state.db, config.yaml (telegram room fields and `timezone` only), cron/jobs.json} and personas/personas.json.
// Never reads .env, auth.json or tokens. Any unreadable source degrades to "unknown/empty", never a crash.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import type { EpochSeconds, GatewayStatus, HermesSource, HermesState, MessageQuery, MessagesResult } from './types.ts';
import { createChatKeyer, type ChatKeyer } from './chatKey.ts';
import { parseGatewayFile, parseStatusApi } from './parseGateway.ts';
import { parseTelegramConfig } from './parseTelegram.ts';
import { parseCronJobs, parseHermesTimeZone, parsePersonas } from './parseMisc.ts';
import { readKanban } from './kanbanReader.ts';
import { readMeetingRecords as readMeetingsDb } from './meetingsReader.ts';
import { readKanbanWaiting } from './kanbanWaiting.ts';
import { readGroupChatNames, readLatestSession, readRoomMessages } from './sessionsReader.ts';
import { createLiveActivity } from './liveActivity.ts';
import { BOT_PROFILES, isBotProfile } from '../roster.ts';
import { log, redact } from '../log.ts';

export type LiveSourceOptions = {
  hermesHome: string;
  statusUrl: string | null; // e.g. http://127.0.0.1:9119/api/status; null = file only
  keyOf?: ChatKeyer;
  now?: () => EpochSeconds;
  fetchTimeoutMs?: number;
};

const EMPTY_KANBAN = { tasks: [], runs: [], subs: [], links: [] } as const;

function attempt<T>(label: string, fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch (error) {
    log('hermes.read_failed', { source: label, detail: redact(error instanceof Error ? error.message : String(error)) });
    return fallback;
  }
}

function pidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function createLiveSource(opts: LiveSourceOptions): HermesSource {
  const keyOf = opts.keyOf ?? createChatKeyer();
  const now = opts.now ?? (() => Date.now() / 1000);
  const home = opts.hermesHome;
  const profileFile = (profile: string, ...parts: string[]) => path.join(home, 'profiles', profile, ...parts);

  async function readGateway(): Promise<GatewayStatus | null> {
    if (opts.statusUrl) {
      try {
        const res = await fetch(opts.statusUrl, { signal: AbortSignal.timeout(opts.fetchTimeoutMs ?? 1500) });
        const parsed = res.ok ? parseStatusApi(await res.json()) : null;
        if (parsed) return parsed;
      } catch {
        // fall through to the state file
      }
    }
    return attempt('gateway_state.json', () => parseGatewayFile(readJson(path.join(home, 'gateway_state.json')), pidAlive), null);
  }

  async function readState(): Promise<HermesState> {
    const at = now();
    const gateway = await readGateway();
    const configs = BOT_PROFILES.map((p) => attempt(`config.yaml:${p}`,
      () => YAML.parse(readFileSync(profileFile(p, 'config.yaml'), 'utf8'), { intAsBigInt: true, logLevel: 'error' }) as unknown, null));
    const telegram = BOT_PROFILES.map((p, i) => attempt(`config.yaml:${p}:telegram`, () => parseTelegramConfig(p, configs[i], keyOf),
      { profile: p, enabled: false, groupChats: [], leadChats: [], roomHints: {} }));
    const chatNames = Object.assign({}, ...BOT_PROFILES.map((p) =>
      attempt(`state.db:${p}:names`, () => readGroupChatNames(profileFile(p, 'state.db'), keyOf), {})));
    const sessions = BOT_PROFILES.flatMap((p) => {
      const s = attempt(`state.db:${p}`, () => readLatestSession(profileFile(p, 'state.db'), p), null);
      return s ? [s] : [];
    });
    const cron = BOT_PROFILES.flatMap((p, i) => attempt(`cron:${p}`, () => {
      try {
        return parseCronJobs(p, readJson(profileFile(p, 'cron', 'jobs.json')), parseHermesTimeZone(configs[i]));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
        throw error;
      }
    }, []));
    return {
      recordedAt: new Date(at * 1000).toISOString(),
      gateway, telegram, chatNames, sessions, cron,
      kanban: {
        ...(attempt('kanban.db', () => readKanban(path.join(home, 'kanban.db'), keyOf, at), null) ?? EMPTY_KANBAN),
        waiting: attempt('kanban.db:waiting', () => readKanbanWaiting(path.join(home, 'kanban.db')), null) ?? [],
      },
      personas: attempt('personas.json', () => parsePersonas(readJson(path.join(home, 'personas', 'personas.json'))), {}),
    };
  }

  async function readMessages(query: MessageQuery): Promise<MessagesResult> {
    if (!isBotProfile(query.profile)) return { ok: false, reason: 'unknown-profile' };
    const messages = attempt(`state.db:${query.profile}:messages`,
      () => readRoomMessages(profileFile(query.profile, 'state.db'), query.profile, query, keyOf), undefined);
    if (messages === undefined) return { ok: false, reason: 'read-failed' };
    return messages === null ? { ok: false, reason: 'no-state-db' } : { ok: true, messages };
  }

  const readMeetingRecords: HermesSource['readMeetingRecords'] = async (period) =>
    attempt('kanban.db:meetings', () => readMeetingsDb(path.join(home, 'kanban.db'), keyOf, period), null);

  return { kind: 'live', readState, readMessages, readMeetingRecords, ...createLiveActivity({ hermesHome: home }) };
}
