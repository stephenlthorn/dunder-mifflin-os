// GET/POST /api/demo/clock: the demo day's clock and its speed (1x, 10x, 60x). Present only while a demo adapter
// runs (404 otherwise). Changing the speed is a POST, so like every write it needs DMOS_ALLOW_WRITES (the demo turns
// that on: its bots live in memory).
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isDemoAdapter } from '../adapters/demo/adapter.ts';
import type { AgentAdapter } from '../adapters/types.ts';
import { sendError, sendJson } from './respond.ts';

type Ctx = { req: IncomingMessage; res: ServerResponse; cors: Record<string, string>; params: ReadonlyArray<string> };
export type DemoRoute = { method: 'GET' | 'POST'; pattern: RegExp; handler: (ctx: Ctx) => Promise<void> };

const CLOCK = /^\/api\/demo\/clock$/;

export function demoRoutes(adapters: ReadonlyArray<AgentAdapter>, jsonBody: (ctx: Ctx) => Promise<Record<string, unknown> | null>): DemoRoute[] {
  const demo = adapters.find(isDemoAdapter);
  const missing = (ctx: Ctx) => sendError(ctx.res, 404, 'No demo is running', ctx.cors);
  return [
    { method: 'GET', pattern: CLOCK, handler: async (ctx) => (demo ? sendJson(ctx.res, 200, demo.demo.clock(), ctx.cors) : missing(ctx)) },
    {
      method: 'POST', pattern: CLOCK,
      handler: async (ctx) => {
        if (!demo) return missing(ctx);
        const body = await jsonBody(ctx);
        if (!body) return;
        const result = demo.demo.setSpeed(body.speed);
        if (!result.ok) return sendError(ctx.res, result.status, result.error, ctx.cors);
        sendJson(ctx.res, 200, result.value, ctx.cors);
      },
    },
  ];
}
