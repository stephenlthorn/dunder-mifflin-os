// POST /api/chat: one hermes chat call per message, at most one in flight per profile.
import type { AgentMessage } from '../adapters/types.ts';
import { roomById } from '../rooms.ts';
import { validateChatText } from '../validate.ts';
import { scrubText } from '../domain/scrub.ts';
import { log, redact } from '../log.ts';
import { buildChatArgs, chatSessionTitle, chatTarget } from './commands.ts';
import type { Runner } from './runner.ts';

export type ServiceError = { ok: false; status: 400 | 404 | 429 | 502 | 504; error: string };
export type ChatResult = { ok: true; messages: AgentMessage[] } | ServiceError;

export type ChatServiceOptions = { runner: Runner; hermesBin: string; timeoutMs: number; now?: () => number };

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;
const SILENT = new Set(['NO_REPLY', '[SILENT]']);

export function createChatService(opts: ChatServiceOptions) {
  const now = opts.now ?? Date.now;
  let inFlight: ReadonlySet<string> = new Set();

  async function run(roomId: string, profile: string, query: string): Promise<ChatResult> {
    const started = now();
    try {
      const res = await opts.runner(opts.hermesBin, buildChatArgs(profile, chatSessionTitle(roomId), query), { timeoutMs: opts.timeoutMs });
      log('chat.done', { roomId, profile, code: res.code, timedOut: res.timedOut, ms: now() - started });
      if (res.timedOut) return { ok: false, status: 504, error: 'The bot did not answer in time' };
      if (res.code !== 0) {
        log('chat.failed', { roomId, profile, detail: redact(res.stderr.split('\n').find((l) => l.trim()) ?? '') });
        return { ok: false, status: 502, error: `The bot could not answer (exit ${res.code ?? 'signal'})` };
      }
      const text = scrubText(res.stdout.replace(ANSI, '').trim());
      if (!text || SILENT.has(text)) return { ok: true, messages: [] };
      const at = now();
      return { ok: true, messages: [{ id: `os-${profile}-${at}`, roomId, authorAgentId: profile, text, at: new Date(at).toISOString() }] };
    } catch (error) {
      log('chat.error', { roomId, profile, detail: redact(error instanceof Error ? error.message : String(error)) });
      return { ok: false, status: 502, error: 'Could not start the hermes CLI' };
    }
  }

  async function send(roomId: string, rawText: unknown): Promise<ChatResult> {
    const target = roomById(roomId) ? chatTarget(roomId) : null;
    if (!target) return { ok: false, status: 404, error: 'Unknown room' };
    const text = validateChatText(rawText);
    if (!text.ok) return { ok: false, status: 400, error: text.error };
    if (inFlight.has(target.profile)) return { ok: false, status: 429, error: `${target.profile} is still answering the previous message` };
    inFlight = new Set([...inFlight, target.profile]);
    try {
      return await run(roomId, target.profile, `${target.prefix}${text.value}`);
    } finally {
      inFlight = new Set([...inFlight].filter((p) => p !== target.profile));
    }
  }

  return { send, busy: (profile: string): boolean => inFlight.has(profile) };
}
