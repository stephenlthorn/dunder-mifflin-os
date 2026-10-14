// Bounded body readers: JSON for the API, url-encoded for the sign-in form.
import type { IncomingMessage } from 'node:http';

export const BODY_LIMIT = 16 * 1024;
export const FORM_LIMIT = 4 * 1024;

export type BodyResult = { ok: true; value: unknown } | { ok: false; status: 400 | 413; error: string };
export type FormResult = { ok: true; value: URLSearchParams } | { ok: false; status: 413; error: string };

async function readText(req: IncomingMessage, limit: number): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += buf.length;
    if (size > limit) return null;
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export async function readJsonBody(req: IncomingMessage, limit = BODY_LIMIT): Promise<BodyResult> {
  const text = await readText(req, limit);
  if (text === null) return { ok: false, status: 413, error: `Body larger than ${limit} bytes` };
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: 'Body is not valid JSON' };
  }
}

export async function readFormBody(req: IncomingMessage, limit = FORM_LIMIT): Promise<FormResult> {
  const text = await readText(req, limit);
  if (text === null) return { ok: false, status: 413, error: `Body larger than ${limit} bytes` };
  return { ok: true, value: new URLSearchParams(text) };
}

/** A refused body may still be on the wire: close the connection so the client never reuses a half-read socket. */
export function bodyErrorHeaders(status: number, headers: Readonly<Record<string, string>>): Record<string, string> {
  return status === 413 ? { ...headers, Connection: 'close' } : { ...headers };
}
