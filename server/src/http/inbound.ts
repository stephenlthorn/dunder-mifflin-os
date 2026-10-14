// Inbound endpoints added by adapters (webhook ingest, Claude Code hooks). Order: bearer token (before the body is
// read), a shared rate limit, the size-capped JSON body, then the adapter's own schema check and handler. A handler may
// answer later (a held PermissionRequest); its signal aborts if the caller hangs up first.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { InboundRoute } from '../adapters/types.ts';
import { bodyErrorHeaders, readJsonBody } from './body.ts';
import { createRateLimiter } from './rateLimit.ts';
import { BASE_HEADERS, sendError, sendJson } from './respond.ts';

export type InboundMatch = { route: InboundRoute; params: ReadonlyArray<string> };

/** Paths reserved for adapters' inbound endpoints (webhook ingest, Claude Code hooks): never behind the cookie sign-in. */
export const INBOUND_PREFIXES: ReadonlyArray<string> = Object.freeze(['/api/ingest/', '/api/hooks/']);
export const isInboundPath = (pathname: string): boolean => INBOUND_PREFIXES.some((p) => pathname.startsWith(p));

/** All inbound endpoints together: at most this many requests a minute (each adapter also limits per agent). */
export const INBOUND_MAX_PER_MINUTE = 1200;

export function createInbound(routes: ReadonlyArray<InboundRoute>, limit = INBOUND_MAX_PER_MINUTE) {
  const limiter = createRateLimiter({ max: limit, windowMs: 60_000 });

  function match(pathname: string): InboundMatch | null {
    for (const route of routes) {
      const m = route.pattern.exec(pathname);
      if (m) return { route, params: m.slice(1) };
    }
    return null;
  }

  async function handle(req: IncomingMessage, res: ServerResponse, found: InboundMatch, cors: Record<string, string>): Promise<void> {
    if (req.method !== 'POST') return sendError(res, 405, 'Method not allowed', cors);
    if (!found.route.authorize(req.headers)) return sendError(res, 401, 'Missing or wrong bearer token', { ...cors, 'WWW-Authenticate': 'Bearer' });
    if (!limiter.take()) return sendError(res, 429, 'Too many events; slow down', { ...cors, 'Retry-After': '60' });
    const body = await readJsonBody(req, found.route.maxBodyBytes);
    if (!body.ok) return sendError(res, body.status, body.error, bodyErrorHeaders(body.status, cors));
    const hangUp = new AbortController();
    const onClose = () => { if (!res.writableEnded) hangUp.abort(); };
    res.on('close', onClose);
    const out = await found.route.handle({ params: found.params, body: body.value, signal: hangUp.signal });
    res.off('close', onClose);
    if (res.destroyed) return; // the caller hung up while the handler waited
    if (out.status === 204) {
      res.writeHead(204, { ...BASE_HEADERS, ...cors, ...out.headers, 'Cache-Control': 'no-store' });
      res.end();
      return;
    }
    sendJson(res, out.status, out.body ?? {}, { ...cors, ...out.headers });
  }

  return { match, handle };
}
