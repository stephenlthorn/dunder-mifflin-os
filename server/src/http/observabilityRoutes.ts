// GET /api/people/:id/timeline?since=<ISO>&limit=<n> and GET /api/usage?period=today|7d|30d. Read-only, so they work
// on a read-only server; sign-in protected like every other /api route (app.ts runs access first).
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Observability } from '../office/observability.ts';
import { parsePeriod, timelineSince } from '../usage/periods.ts';
import { sendError, sendJson } from './respond.ts';

type Ctx = { req: IncomingMessage; res: ServerResponse; cors: Record<string, string>; params: ReadonlyArray<string> };
export type ReadRoute = { method: 'GET'; pattern: RegExp; handler: (ctx: Ctx) => Promise<void> };

const PERSON_ID = /^[a-z0-9][a-z0-9-]{0,80}$/;

function decode(value: string | undefined): string {
  try {
    return decodeURIComponent(value ?? '');
  } catch {
    return '';
  }
}

const query = (req: IncomingMessage) => new URL(req.url ?? '/', 'http://127.0.0.1').searchParams;

export function observabilityRoutes(obs: Observability, nowMs: () => number): ReadonlyArray<ReadRoute> {
  return [
    {
      method: 'GET', pattern: /^\/api\/people\/([^/]+)\/timeline$/,
      handler: async ({ req, res, cors, params }) => {
        const personId = decode(params[0]);
        if (!PERSON_ID.test(personId)) return sendError(res, 404, 'Unknown person', cors);
        const q = query(req);
        const parsed = timelineSince(q.get('since'), q.get('limit'), nowMs());
        if (!parsed.ok) return sendError(res, 400, parsed.error, cors);
        const result = await obs.timeline(personId, { since: parsed.since, limit: parsed.limit });
        if (!result) return sendError(res, 404, 'Unknown person', cors);
        sendJson(res, 200, result, cors);
      },
    },
    {
      method: 'GET', pattern: /^\/api\/usage$/,
      handler: async ({ req, res, cors }) => {
        const period = parsePeriod(query(req).get('period'));
        if (!period.ok) return sendError(res, 400, period.error, cors);
        sendJson(res, 200, await obs.usageReport(period.period), cors);
      },
    },
  ];
}
