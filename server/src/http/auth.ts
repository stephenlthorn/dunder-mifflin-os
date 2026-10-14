// Access-token primitives for remote use: constant-time token check, the session cookie derived from the token
// (never the token itself) and a same-site redirect target. The token is never logged or echoed.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

export const SESSION_COOKIE = 'dmos_session';
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;
const MAX_TOKEN_INPUT = 1024;
const MAX_NEXT = 512;
const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]']);

type HasHeaders = { headers: IncomingHttpHeaders };

const digest = (value: string) => createHash('sha256').update(value, 'utf8').digest();

/** Compares fixed-length digests with timingSafeEqual, so the time taken says nothing about the token. */
export function tokenMatches(candidate: unknown, token: string): boolean {
  if (typeof candidate !== 'string' || candidate.length === 0 || candidate.length > MAX_TOKEN_INPUT) return false;
  return timingSafeEqual(digest(candidate), digest(token));
}

/** The cookie value: an HMAC of a fixed label under the token. Rotating the token signs everyone out. */
export function sessionValue(token: string): string {
  return createHmac('sha256', token).update('dmos-session-v1').digest('base64url');
}

export function sessionCookie(value: string, secure: boolean): string {
  const parts = [`${SESSION_COOKIE}=${value}`, 'Path=/', `Max-Age=${SESSION_MAX_AGE_S}`, 'HttpOnly', 'SameSite=Strict'];
  return (secure ? [...parts, 'Secure'] : parts).join('; ');
}

export function readCookie(header: string | undefined, name: string): string | null {
  for (const pair of (header ?? '').split(';')) {
    const at = pair.indexOf('=');
    if (at > 0 && pair.slice(0, at).trim() === name) return pair.slice(at + 1).trim();
  }
  return null;
}

export function isSignedIn(req: HasHeaders, token: string): boolean {
  const cookie = readCookie(req.headers.cookie, SESSION_COOKIE);
  return cookie !== null && timingSafeEqual(digest(cookie), digest(sessionValue(token)));
}

/**
 * Secure everywhere except a plain request to this machine's loopback (Docker's published port, or the local browser
 * next to a `tailscale serve` setup): Safari refuses Secure cookies on http://localhost, and loopback traffic never
 * crosses a network. Anything proxied or addressed by another name gets Secure.
 */
export function needsSecureCookie(req: HasHeaders): boolean {
  const h = req.headers;
  if (h['x-forwarded-for'] || h['x-forwarded-proto'] || h['x-forwarded-host'] || h.forwarded) return true;
  try {
    return !LOOPBACK_HOSTNAMES.has(new URL(`http://${h.host ?? ''}`).hostname);
  } catch {
    return true;
  }
}

/** Where to go after signing in: a same-origin path only (no scheme, no `//` or `/\`, no control characters). */
export function safeNext(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > MAX_NEXT || !raw.startsWith('/')) return '/';
  if (raw.startsWith('//') || raw.startsWith('/\\') || /[\u0000-\u001f\u007f]/.test(raw)) return '/';
  if (raw === '/login' || raw.startsWith('/login?')) return '/';
  return raw;
}
