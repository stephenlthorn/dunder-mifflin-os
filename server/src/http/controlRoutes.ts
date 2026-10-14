// POST /api/people/:id/actions {action, args}: a control verb (pause, resume, stop, run-job, reassign) for the bot at
// that desk; GET /api/budgets: Corporate's report (budgets/monitor.ts). Both sit behind sign-in like every /api
// route (app.ts runs access first); the POST is also refused on a read-only server by app.ts and again, per verb,
// by office/controls.ts. Both are rate-limited.
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { BudgetsReport } from '../../../shared/controls.ts';
import type { ControlActor, ControlOutcome } from '../office/controls.ts';
import { createRateLimiter } from './rateLimit.ts';
import { sendError, sendJson } from './respond.ts';

type Ctx = { req: IncomingMessage; res: ServerResponse; cors: Record<string, string>; params: ReadonlyArray<string> };
export type ControlRoute = { method: 'GET' | 'POST'; pattern: RegExp; handler: (ctx: Ctx) => Promise<void> };

export type ControlRouteDeps = {
  readonly act: (personId: string, body: unknown, actor: ControlActor) => Promise<ControlOutcome>;
  readonly budgets: () => Promise<BudgetsReport>;
  readonly actor: ControlActor; // who a request that got this far is: signed in, or an open local server
  readonly readBody: (ctx: Ctx) => Promise<Record<string, unknown> | null>; // answers the error itself when null
  readonly onChanged: () => void; // push a fresh snapshot to every open tab
};

export const ACTIONS_PER_MINUTE = 20;
export const BUDGET_READS_PER_MINUTE = 60;
const PERSON_ID = /^[a-z0-9][a-z0-9-]{0,80}$/;

function decode(value: string | undefined): string {
  try {
    return decodeURIComponent(value ?? '');
  } catch {
    return '';
  }
}

export function controlRoutes(deps: ControlRouteDeps): ReadonlyArray<ControlRoute> {
  const actions = createRateLimiter({ max: ACTIONS_PER_MINUTE, windowMs: 60_000 });
  const reads = createRateLimiter({ max: BUDGET_READS_PER_MINUTE, windowMs: 60_000 });
  return [
    {
      method: 'POST', pattern: /^\/api\/people\/([^/]+)\/actions$/,
      handler: async (ctx) => {
        if (!actions.take()) return sendError(ctx.res, 429, 'Too many actions; try again in a minute', ctx.cors);
        const personId = decode(ctx.params[0]);
        const body = await deps.readBody(ctx);
        if (!body) return;
        if (!PERSON_ID.test(personId)) return sendError(ctx.res, 404, 'No agent at that desk', ctx.cors);
        const result = await deps.act(personId, body, deps.actor);
        if (!result.ok) return sendError(ctx.res, result.status, result.error, ctx.cors);
        sendJson(ctx.res, 200, result.value, ctx.cors);
        deps.onChanged();
      },
    },
    {
      method: 'GET', pattern: /^\/api\/budgets$/,
      handler: async ({ res, cors }) => {
        if (!reads.take()) return sendError(res, 429, 'Too many budget reads; try again in a minute', cors);
        sendJson(res, 200, await deps.budgets(), cors);
      },
    },
  ];
}
