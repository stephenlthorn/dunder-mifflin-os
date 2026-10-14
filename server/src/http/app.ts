// The HTTP app: node:http + a small router. Wires the agent adapters (through the office service), the SSE hub,
// the adapters' inbound endpoints, portraits and headshots. Read-only unless `allowWrites`; sign-in when
// `accessToken` is set (inbound agent endpoints use their own bearer token instead). Binding (127.0.0.1 unless
// DMOS_HOST) happens in main.ts.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { Capabilities, OfficeSnapshot } from '../../../shared/contract.ts';
import type { EpochSeconds } from '../hermes/types.ts';
import type { AgentAdapter } from '../adapters/types.ts';
import { createOfficeService } from '../office/service.ts';
import { defaultOfficeSetup, type OfficeSetup } from '../office/office.ts';
import { mergeSeatRules } from '../office/seating.ts';
import { READ_ONLY_ERROR } from '../office/writes.ts';
import { DEFAULT_SEATS } from '../roster.ts';
import { isRoomIdShape } from '../validate.ts';
import { log, redact } from '../log.ts';
import { ALLOWED_HOSTS, ALLOWED_ORIGINS, MESSAGES_LIMIT } from '../config.ts';
import { corsHeaders, gate } from './guard.ts';
import { bodyErrorHeaders, readJsonBody } from './body.ts';
import { sendError, sendJson } from './respond.ts';
import { createSseHub } from './sse.ts';
import { readHeadshot } from './headshots.ts';
import { sendImage } from './images.ts';
import { readPortrait } from './portraits.ts';
import { createStaticSite } from './staticFiles.ts';
import { createRateLimiter } from './rateLimit.ts';
import { createInbound, isInboundPath } from './inbound.ts';
import { isRecord } from '../hermes/guards.ts';
import { createAccess } from './access.ts';
import { demoRoutes } from './demoRoutes.ts';
import { createCalendarHandlers, type CalendarReply } from './calendarRoutes.ts';
import { localTimeZone } from '../../../shared/schedule/zone.ts';
import { observabilityRoutes } from './observabilityRoutes.ts';
import { createObservability } from '../office/observability.ts';
import { BUILT_IN_PRICES, type PriceTable } from '../usage/priceTable.ts';
import { type AuditLog, createAuditLog } from '../audit/auditLog.ts';
import type { BudgetConfig } from '../budgets/config.ts';
import { createBudgetMonitor } from '../budgets/monitor.ts';
import { controlRoutes } from './controlRoutes.ts';
import { unattributedRoutes } from './unattributedRoutes.ts';

export type AppDeps = {
  adapters: ReadonlyArray<AgentAdapter>;
  setup?: OfficeSetup; // seating rules + staff; default: the built-in Hermes seating
  hermesHome: string;
  headshotDir: string | null; // null: no bot headshots (the demo)
  portraitsDir?: string | null; // local staff photos (DMOS_PORTRAITS_DIR); absent = bot headshots only
  pollIntervalMs: number;
  now?: () => EpochSeconds;
  allowedOrigins?: ReadonlySet<string>;
  allowedHosts?: ReadonlySet<string>; // Host names besides localhost (published via `tailscale serve`)
  webRoot?: string | null; // built web app (web/dist) served at / for `npm run start`; null/absent = API only
  allowWrites?: boolean; // DMOS_ALLOW_WRITES=1: chat, task creation and any other non-GET route; default off
  accessToken?: string | null; // DMOS_ACCESS_TOKEN: require sign-in; null/absent = open (local use)
  timeZone?: string; // the zone scheduled jobs run in when their adapter doesn't say; default: this machine's
  prices?: PriceTable; // token prices for the ledger's cost estimates; default: the built-in dated table
  auditFile?: string | null; // DMOS_AUDIT_LOG: decisions and control verbs are written here first; null/absent = refused
  audit?: AuditLog; // an audit log to use instead of auditFile (the demo keeps its own in memory)
  budgets?: BudgetConfig; // `budgets:` from config.yaml ("Corporate"); absent = none
  budgetCheckMs?: number; // how often Corporate checks budgets with no browser open; default 60 s, 0 = only on GET /api/budgets
};

export { READ_ONLY_ERROR };

export type App = { server: Server; close(): Promise<void>; clientCount(): number };

type Ctx = { req: IncomingMessage; res: ServerResponse; cors: Record<string, string>; params: ReadonlyArray<string> };
type Handler = (ctx: Ctx) => Promise<void>;
type Route = { method: 'GET' | 'POST'; pattern: RegExp; handler: Handler };

const isApiPath = (pathname: string) => pathname === '/api' || pathname.startsWith('/api/');
const urlOf = (req: IncomingMessage) => new URL(req.url ?? '/', 'http://127.0.0.1');

function safeDecode(value: string | undefined): string {
  try {
    return decodeURIComponent(value ?? '');
  } catch {
    return '';
  }
}

export function createApp(deps: AppDeps): App {
  const now = deps.now ?? (() => Date.now() / 1000);
  const allowed = deps.allowedOrigins ?? ALLOWED_ORIGINS;
  const hosts = deps.allowedHosts ?? ALLOWED_HOSTS;
  const capabilities: Capabilities = { writes: deps.allowWrites === true };
  const office = createOfficeService({
    adapters: deps.adapters, setup: deps.setup ?? defaultOfficeSetup(mergeSeatRules(DEFAULT_SEATS, {})), now, allowWrites: capabilities.writes,
    audit: deps.audit ?? (deps.auditFile ? createAuditLog({ file: deps.auditFile }) : null),
  });
  const snapshot = async (fresh = false): Promise<OfficeSnapshot> => ({ ...(await (fresh ? office.fresh() : office.read())).snapshot, capabilities });
  const hub = createSseHub({ load: () => snapshot(true), intervalMs: deps.pollIntervalMs });
  const unsubscribe = office.subscribe(() => hub.poke());
  const inbound = createInbound(deps.adapters.flatMap((a) => a.routes ?? []));
  const taskLimiter = createRateLimiter({ max: 10, windowMs: 60_000 });
  const decisionLimiter = createRateLimiter({ max: 30, windowMs: 60_000 });
  const actor = deps.accessToken ? 'signed-in' as const : 'local' as const; // a request that got this far is signed in
  const site = deps.webRoot ? createStaticSite(deps.webRoot) : null;
  const access = createAccess({ token: deps.accessToken ?? null });
  const calendar = createCalendarHandlers({ office, now, timeZone: deps.timeZone ?? localTimeZone() });
  const reply = (res: ServerResponse, out: CalendarReply, cors: Record<string, string>) => sendJson(res, out.status, out.body, cors);
  const observability = createObservability({ adapters: deps.adapters, read: office.read, prices: deps.prices ?? BUILT_IN_PRICES, nowMs: () => now() * 1000 });
  const corporate = createBudgetMonitor({
    config: deps.budgets ?? { autoPause: false, limits: {} }, people: async () => (await office.read()).snapshot.people,
    usageIn: observability.usageIn, nowMs: () => now() * 1000,
    pause: async (personId, reason) => {
      const out = await office.act(personId, { action: 'pause' }, 'corporate', reason);
      if (out.ok) void hub.refresh(); // every open tab sees the bot go home
      return out;
    },
  });
  corporate.start(deps.budgetCheckMs ?? 60_000);

  async function jsonBody(ctx: Ctx): Promise<Record<string, unknown> | null> {
    const body = await readJsonBody(ctx.req);
    if (!body.ok) return (sendError(ctx.res, body.status, body.error, bodyErrorHeaders(body.status, ctx.cors)), null);
    if (!isRecord(body.value)) return (sendError(ctx.res, 400, 'Body must be a JSON object', ctx.cors), null);
    return body.value;
  }

  const routes: ReadonlyArray<Route> = [
    { method: 'GET', pattern: /^\/api\/health$/, handler: async ({ res }) => sendJson(res, 200, { ok: true }) },
    { method: 'GET', pattern: /^\/api\/office$/, handler: async ({ res, cors }) => sendJson(res, 200, await snapshot(), cors) },
    { method: 'GET', pattern: /^\/api\/events$/, handler: async ({ res, cors }) => hub.add(res, cors) },
    { method: 'GET', pattern: /^\/api\/schedule$/, handler: async ({ req, res, cors }) => reply(res, await calendar.schedule(urlOf(req)), cors) },
    { method: 'GET', pattern: /^\/api\/meetings$/, handler: async ({ req, res, cors }) => reply(res, await calendar.meetings(urlOf(req)), cors) },
    {
      method: 'GET', pattern: /^\/api\/rooms\/([^/]+)\/messages$/,
      handler: async ({ res, cors, params }) => {
        const roomId = safeDecode(params[0]);
        const result = isRoomIdShape(roomId) ? await office.messages(roomId, MESSAGES_LIMIT) : null;
        if (!result) return sendError(res, 404, 'Unknown room', cors);
        sendJson(res, 200, result.messages, result.reason ? { ...cors, 'X-DMOS-Messages-Reason': result.reason } : cors);
      },
    },
    {
      method: 'POST', pattern: /^\/api\/chat$/,
      handler: async (ctx) => {
        const body = await jsonBody(ctx);
        if (!body) return;
        const result = await office.chat(isRoomIdShape(body.roomId) ? body.roomId : '', body.text);
        if (!result.ok) return sendError(ctx.res, result.status, result.error, ctx.cors);
        sendJson(ctx.res, 200, result.value, ctx.cors);
      },
    },
    {
      method: 'POST', pattern: /^\/api\/tasks$/,
      handler: async (ctx) => {
        if (!taskLimiter.take()) return sendError(ctx.res, 429, 'Too many new cards; try again in a minute', ctx.cors);
        const body = await jsonBody(ctx);
        if (!body) return;
        const roomId = isRoomIdShape(body.roomId) ? body.roomId : '';
        const result = await office.createTask({ roomId, title: body.title, assignee: body.assignee });
        if (!result.ok) return sendError(ctx.res, result.status, result.error, ctx.cors);
        sendJson(ctx.res, 201, result.value, ctx.cors);
        void hub.refresh();
      },
    },
    { method: 'GET', pattern: /^\/api\/approvals$/, handler: async ({ res, cors }) => sendJson(res, 200, await office.approvals(), cors) },
    {
      method: 'POST', pattern: /^\/api\/approvals\/([^/]+)$/,
      handler: async (ctx) => {
        if (!decisionLimiter.take()) return sendError(ctx.res, 429, 'Too many decisions; try again in a minute', ctx.cors);
        const body = await jsonBody(ctx);
        if (!body) return;
        const result = await office.resolveApproval(safeDecode(ctx.params[0]), body, actor);
        if (!result.ok) return sendError(ctx.res, result.status, result.error, ctx.cors);
        sendJson(ctx.res, 200, { ok: true }, ctx.cors);
        void hub.refresh();
      },
    },
    {
      method: 'GET', pattern: /^\/api\/headshots\/([^/]+)$/,
      handler: async ({ res, cors, params }) => {
        const shot = deps.headshotDir ? await readHeadshot(safeDecode(params[0]), deps.headshotDir) : null;
        if (!shot) return sendError(res, 404, 'No headshot', cors);
        sendImage(res, shot, cors);
      },
    },
    {
      method: 'GET', pattern: /^\/api\/portraits\/([^/]+)$/,
      handler: async ({ res, cors, params }) => {
        const personId = safeDecode(params[0]);
        const dirs = { portraitsDir: deps.portraitsDir ?? null, headshotDir: deps.headshotDir };
        const profile = await office.hermesProfileOf(personId);
        const image = await readPortrait(personId, dirs, () => profile);
        if (!image) return sendError(res, 404, 'No portrait', cors);
        sendImage(res, image, cors);
      },
    },
    ...observabilityRoutes(observability, () => now() * 1000), // timeline + usage (the documentary crew, Angela's ledger)
    ...controlRoutes({ act: office.act, budgets: corporate.check, actor, readBody: jsonBody, onChanged: () => void hub.refresh() }),
    ...demoRoutes(deps.adapters, jsonBody), // /api/demo/clock, only while a demo adapter runs
    ...unattributedRoutes(office.read), // Creed's corner: agents, cards and requests no desk can hold
  ];

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    if (gate(req, res, allowed, hosts)) return;
    const cors = corsHeaders(req.headers.origin, allowed);
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    const { pathname } = url;
    // Agents and Claude Code can't sign in with a cookie: their endpoints take DMOS_INGEST_TOKEN instead, and only
    // exist while their adapter is configured (any other path under them is a 404). Ingest isn't a write to an
    // agent, so it works on a read-only server too.
    if (isInboundPath(pathname)) {
      const external = inbound.match(pathname);
      return external ? inbound.handle(req, res, external, cors) : sendError(res, 404, 'Not found', cors);
    }
    if (await access.handle(req, res, url)) return;
    if (site && !isApiPath(pathname)) {
      if (req.method === 'GET' || req.method === 'HEAD') return site.serve(req, res, pathname);
      return sendError(res, 405, 'Method not allowed', cors);
    }
    const matches = routes.filter((r) => r.pattern.test(pathname));
    const route = matches.find((r) => r.method === req.method);
    if (!route) return sendError(res, matches.length ? 405 : 404, matches.length ? 'Method not allowed' : 'Not found', cors);
    if (route.method !== 'GET' && !capabilities.writes) return sendError(res, 403, READ_ONLY_ERROR, cors); // every write, present and future
    const params = route.pattern.exec(pathname)?.slice(1) ?? [];
    await route.handler({ req, res, cors, params });
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((error: unknown) => {
      log('http.error', { path: (req.url ?? '').slice(0, 80), detail: redact(error instanceof Error ? error.message : String(error)) });
      if (!res.headersSent) sendError(res, 500, 'Internal error');
      else res.end();
    });
  });

  async function close(): Promise<void> {
    unsubscribe();
    corporate.close();
    hub.close();
    const closed = new Promise<void>((resolve) => server.close(() => resolve()));
    server.closeAllConnections();
    await closed;
    await Promise.all(deps.adapters.map((a) => a.close?.()));
  }

  return { server, close, clientCount: () => hub.clientCount() };
}
