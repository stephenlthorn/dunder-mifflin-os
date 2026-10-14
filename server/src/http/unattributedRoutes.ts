// GET /api/unattributed: Creed's corner, what no desk can hold (office/unattributed.ts). Read-only, so it works on a
// read-only server; sign-in protected like every other /api route (app.ts runs access first).
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { UnattributedReport } from '../../../shared/unattributed.ts';
import type { Office } from '../office/office.ts';
import { sendJson } from './respond.ts';

type Ctx = { req: IncomingMessage; res: ServerResponse; cors: Record<string, string>; params: ReadonlyArray<string> };
type ReadRoute = { method: 'GET'; pattern: RegExp; handler: (ctx: Ctx) => Promise<void> };

export function unattributedReport(office: Office): UnattributedReport {
  return { generatedAt: office.snapshot.generatedAt, items: office.unattributed.map((i) => ({ ...i })) };
}

export function unattributedRoutes(read: () => Promise<Office>): ReadonlyArray<ReadRoute> {
  return [{
    method: 'GET', pattern: /^\/api\/unattributed$/,
    handler: async ({ res, cors }) => sendJson(res, 200, unattributedReport(await read()), cors),
  }];
}
