// HTTP calls to the Dunder Mifflin OS server (via the Vite /api proxy) plus demo-mode stand-ins.
import type { ChatMessage, Task } from '@shared/contract';
import { parseMessages, parseSnapshot } from './guards';
import { shortName } from '../office/names';

export type ChatResult = { ok: true; messages: ChatMessage[] } | { ok: false; busy: boolean; error: string };
export type TaskResult = { ok: true; task: Task } | { ok: false; error: string };

const CHAT_TIMEOUT_MS = 200_000; // bots can take ~3 minutes to answer
const errorText = (status: number, body: unknown) =>
  (typeof body === 'object' && body && typeof (body as { error?: unknown }).error === 'string'
    ? (body as { error: string }).error
    : `Request failed (${status})`);

/** The server wants a signed-in browser (remote access with DMOS_ACCESS_TOKEN). */
export class SignInRequiredError extends Error {
  constructor() {
    super('Sign in required');
    this.name = 'SignInRequiredError';
  }
}

export const isDemoRequested = (search: string, mode: string) => mode === 'demo' || new URLSearchParams(search).get('demo') === '1';

export function interpretChatResponse(status: number, body: unknown): ChatResult {
  if (status >= 200 && status < 300) return { ok: true, messages: parseMessages(body) };
  return { ok: false, busy: status === 429, error: errorText(status, body) };
}

export function interpretTaskResponse(status: number, body: unknown): TaskResult {
  if (status >= 200 && status < 300) {
    const snap = parseSnapshot({ people: [], presence: {}, rooms: [], tasks: [body] });
    const task = snap?.tasks[0];
    return task ? { ok: true, task } : { ok: false, error: 'The server returned an unexpected task' };
  }
  return { ok: false, error: errorText(status, body) };
}

let localSeq = 0;
export function demoEcho(roomId: string, text: string, lead: { id: string; name: string }, now = Date.now()): [ChatMessage, ChatMessage] {
  localSeq += 1;
  const first = shortName(lead.name);
  return [
    { id: `local-${now}-${localSeq}-me`, roomId, authorId: 'you', text, at: new Date(now).toISOString() },
    { id: `local-${now}-${localSeq}-bot`, roomId, authorId: lead.id, text: `(demo) ${first} here. Got it: "${text}"`, at: new Date(now + 1000).toISOString() },
  ];
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function fetchSnapshot(signal?: AbortSignal) {
  const res = await fetch('/api/office', { signal, headers: { accept: 'application/json' } });
  if (res.status === 401) throw new SignInRequiredError();
  if (!res.ok) throw new Error(`GET /api/office ${res.status}`);
  const snap = parseSnapshot(await readJson(res));
  if (!snap) throw new Error('GET /api/office returned an invalid snapshot');
  return snap;
}

export async function fetchMessages(roomId: string): Promise<{ messages: ChatMessage[]; reason?: string }> {
  const res = await fetch(`/api/rooms/${encodeURIComponent(roomId)}/messages`, { headers: { accept: 'application/json' } });
  if (!res.ok) throw new Error(errorText(res.status, await readJson(res)));
  const messages = parseMessages(await readJson(res));
  const reason = res.headers.get('X-DMOS-Messages-Reason') ?? undefined;
  return { messages, reason: messages.length === 0 ? reason : undefined };
}

export async function sendChat(roomId: string, text: string): Promise<ChatResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), CHAT_TIMEOUT_MS);
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId, text }),
      signal: ctrl.signal,
    });
    return interpretChatResponse(res.status, await readJson(res));
  } catch (err) {
    return { ok: false, busy: false, error: ctrl.signal.aborted ? 'No reply after 3 minutes' : `Could not reach the server (${String(err)})` };
  } finally {
    clearTimeout(timer);
  }
}

export async function createSharedTask(title: string, assignee: string, roomId = 'ops'): Promise<TaskResult> {
  try {
    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId, title, assignee }),
    });
    return interpretTaskResponse(res.status, await readJson(res));
  } catch (err) {
    return { ok: false, error: `Could not reach the server (${String(err)})` };
  }
}

/** The static demo page (demo.html) has no server behind it, so no photos: it says so in a meta tag. */
const SERVERLESS = typeof document !== 'undefined' && document.querySelector('meta[name="dmos-serverless"]') !== null;
const NO_PHOTO = 'data:,'; // fails to load at once, without a request, so the drawn character stays

/** A person's photo; the server falls back to their bot's headshot and 404s when there is neither. */
export const portraitUrl = (personId: string) => (SERVERLESS ? NO_PHOTO : `/api/portraits/${encodeURIComponent(personId)}`);
