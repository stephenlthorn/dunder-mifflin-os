// Request gatekeeping: Host allow-list (DNS rebinding), CORS for the Vite dev origin only, and
// write protection (allowed Origin + JSON content type) for POSTs. The sign-in form posts url-encoded instead.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { LOGIN_PATH } from './loginPage.ts';
import { sendError } from './respond.ts';

const LOCAL_HOSTNAMES = new Set(['127.0.0.1', 'localhost']);
const NO_EXTRA_HOSTS: ReadonlySet<string> = new Set();
const JSON_TYPE = /^application\/json\b/i;
const FORM_TYPE = /^application\/x-www-form-urlencoded\b/i;

function bodyTypeFor(url: string | undefined): { pattern: RegExp; name: string } {
  const pathname = new URL(url ?? '/', 'http://127.0.0.1').pathname;
  return pathname === LOGIN_PATH ? { pattern: FORM_TYPE, name: 'application/x-www-form-urlencoded' } : { pattern: JSON_TYPE, name: 'application/json' };
}

/** Host header is localhost, or one of the published host names (e.g. the tailnet name behind `tailscale serve`). */
export function isAllowedHost(hostHeader: string | undefined, extraHosts: ReadonlySet<string> = NO_EXTRA_HOSTS): boolean {
  if (!hostHeader) return false;
  try {
    const { hostname } = new URL(`http://${hostHeader}`);
    return LOCAL_HOSTNAMES.has(hostname) || extraHosts.has(hostname);
  } catch {
    return false;
  }
}

export function corsHeaders(origin: string | undefined, allowed: ReadonlySet<string>): Record<string, string> {
  if (!origin || !allowed.has(origin)) return {};
  return { 'Access-Control-Allow-Origin': origin, Vary: 'Origin', 'Access-Control-Expose-Headers': 'X-DMOS-Messages-Reason' };
}

/** Returns true when the request was fully handled (rejected or preflight answered). */
export function gate(
  req: IncomingMessage, res: ServerResponse, allowed: ReadonlySet<string>, hosts: ReadonlySet<string> = NO_EXTRA_HOSTS,
): boolean {
  if (!isAllowedHost(req.headers.host, hosts)) {
    sendError(res, 403, 'Forbidden host');
    return true;
  }
  const origin = req.headers.origin;
  const originOk = origin === undefined || allowed.has(origin);
  if (req.method === 'OPTIONS') {
    if (!origin || !originOk) {
      sendError(res, 403, 'Origin not allowed');
      return true;
    }
    res.writeHead(204, {
      ...corsHeaders(origin, allowed), 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '600',
    });
    res.end();
    return true;
  }
  if (req.method === 'POST') {
    if (!originOk) {
      sendError(res, 403, 'Origin not allowed');
      return true;
    }
    const body = bodyTypeFor(req.url);
    if (!body.pattern.test(req.headers['content-type'] ?? '')) {
      sendError(res, 415, `Content-Type must be ${body.name}`, corsHeaders(origin, allowed));
      return true;
    }
  }
  return false;
}
