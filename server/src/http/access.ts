// Sign-in for remote access (DMOS_ACCESS_TOKEN). With no token configured every request passes (local use stays
// token-free). With one, only /api/health and the sign-in page are open: API calls get 401 and pages go to /login.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { log } from '../log.ts';
import { isSignedIn, needsSecureCookie, safeNext, sessionCookie, sessionValue, tokenMatches } from './auth.ts';
import { readFormBody } from './body.ts';
import { LOGIN_PATH, sendLoginPage } from './loginPage.ts';
import { createRateLimiter } from './rateLimit.ts';
import { BASE_HEADERS, sendError } from './respond.ts';

export type Access = {
  /** Returns true when the request was fully handled here (sign-in page, redirect or refusal). */
  handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean>;
};

export type AccessOptions = { token: string | null; maxAttempts?: number; windowMs?: number; clock?: () => number };

const OPEN_PATHS = new Set(['/api/health']);
const isApiPath = (pathname: string) => pathname === '/api' || pathname.startsWith('/api/');

function redirect(res: ServerResponse, location: string, headers: Readonly<Record<string, string>> = {}): void {
  res.writeHead(303, { ...BASE_HEADERS, Location: location, 'Cache-Control': 'no-store', 'Content-Length': 0, ...headers });
  res.end();
}

export function createAccess(opts: AccessOptions): Access {
  const token = opts.token;
  const limiter = createRateLimiter({ max: opts.maxAttempts ?? 10, windowMs: opts.windowMs ?? 60_000, clock: opts.clock });

  async function signIn(req: IncomingMessage, res: ServerResponse, secret: string): Promise<void> {
    if (!limiter.take()) {
      log('auth.rate_limited');
      return sendLoginPage(res, 429, { next: '/', error: 'Too many sign-in attempts. Wait a minute and try again.' }, { 'Retry-After': '60' });
    }
    const form = await readFormBody(req);
    if (!form.ok) return sendError(res, form.status, form.error);
    const next = safeNext(form.value.get('next'));
    if (!tokenMatches(form.value.get('token'), secret)) {
      log('auth.login_failed');
      return sendLoginPage(res, 401, { next, error: 'That token did not match. Check DMOS_ACCESS_TOKEN and try again.' });
    }
    const secure = needsSecureCookie(req);
    log('auth.login', { secure });
    return redirect(res, next, { 'Set-Cookie': sessionCookie(sessionValue(secret), secure) });
  }

  async function loginPage(req: IncomingMessage, res: ServerResponse, url: URL, secret: string): Promise<void> {
    const next = safeNext(url.searchParams.get('next'));
    if (req.method === 'POST') return signIn(req, res, secret);
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendError(res, 405, 'Method not allowed');
    if (isSignedIn(req, secret)) return redirect(res, next);
    return sendLoginPage(res, 200, { next });
  }

  async function handle(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
    const { pathname } = url;
    if (!token) {
      if (pathname !== LOGIN_PATH) return false;
      redirect(res, '/');
      return true;
    }
    if (OPEN_PATHS.has(pathname)) return false;
    if (pathname === LOGIN_PATH) {
      await loginPage(req, res, url, token);
      return true;
    }
    if (isSignedIn(req, token)) return false;
    if (!isApiPath(pathname) && (req.method === 'GET' || req.method === 'HEAD')) {
      redirect(res, `${LOGIN_PATH}?next=${encodeURIComponent(pathname + url.search)}`);
    } else {
      sendError(res, 401, 'Sign in required');
    }
    return true;
  }

  return { handle };
}
