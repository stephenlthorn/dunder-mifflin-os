// The office server, in the browser, for the static demo (GitHub Pages; no server at all). It runs the server's own
// demo adapter and office service (seating, composition, scrubbing), so the static demo shows exactly what
// `npx dunder-mifflin-os --demo` shows, and answers the same /api calls the app makes: the office, its event
// stream, room messages, chat, new tasks, the demo clock, timelines, the ledger, Creed's corner, control verbs and
// Corporate's budgets. Writes are on: they only reach in-memory demo bots, and verbs are audited in memory.
import type { OfficeSnapshot } from '@shared/contract';
import { createDemoAdapter } from '../../../../server/src/adapters/demo/adapter.ts';
import { demoSeatRules } from '../../../../server/src/adapters/demo/seats.ts';
import { diffSnapshots, fullUpdate, type OfficeUpdate } from '../../../../server/src/domain/diff.ts';
import { defaultOfficeSetup } from '../../../../server/src/office/office.ts';
import { mergeSeatRules } from '../../../../server/src/office/seating.ts';
import { createOfficeService } from '../../../../server/src/office/service.ts';
import { isRoomIdShape } from '../../../../server/src/validate.ts';
import { DEMO_BUDGETS } from '../../../../server/src/adapters/demo/usage.ts';
import { createMemoryAudit } from '../../../../server/src/audit/memoryAudit.ts';
import { createBudgetMonitor } from '../../../../server/src/budgets/monitor.ts';
import { createObservability } from '../../../../server/src/office/observability.ts';
import { unattributedReport } from '../../../../server/src/http/unattributedRoutes.ts';
import { parsePeriod, timelineSince } from '../../../../server/src/usage/periods.ts';
import { BUILT_IN_PRICES } from '../../../../server/src/usage/priceTable.ts';
import type { StaticDemoOptions } from './options';

export type ApiResponse = { readonly status: number; readonly body: unknown; readonly headers?: Readonly<Record<string, string>> };
export type StaticOffice = {
  /** `search`: the query string ('?since=…'), for the calls that take one. */
  handle(method: string, pathname: string, body: unknown, search?: string): Promise<ApiResponse>;
  /** Like GET /api/events: the full presence + tasks first, then each change. Returns a stop function. */
  events(send: (update: OfficeUpdate) => void): () => void;
};

const ADAPTER_ID = 'demo';
const MESSAGES_LIMIT = 50;
const REPLY_DELAY_MS = 900;
const MESSAGES = /^\/api\/rooms\/([^/]+)\/messages$/;
const ACTIONS = /^\/api\/people\/([^/]+)\/actions$/;
const TIMELINE = /^\/api\/people\/([a-z0-9][a-z0-9-]{0,80})\/timeline$/;

const json = (status: number, body: unknown, headers?: Record<string, string>): ApiResponse => ({ status, body, ...(headers ? { headers } : {}) });
const notFound = () => json(404, { error: 'Not found' });
const field = (body: unknown, key: string): unknown => (typeof body === 'object' && body !== null ? (body as Record<string, unknown>)[key] : undefined);
const decode = (raw: string | undefined) => { try { return decodeURIComponent(raw ?? ''); } catch { return ''; } };

export function createStaticOffice(options: StaticDemoOptions = {}): StaticOffice {
  const adapter = createDemoAdapter({ id: ADAPTER_ID, ...options, replyDelayMs: REPLY_DELAY_MS });
  const service = createOfficeService({
    adapters: [adapter],
    setup: defaultOfficeSetup(mergeSeatRules(demoSeatRules(ADAPTER_ID), {})),
    now: () => Date.now() / 1000,
    allowWrites: true,
    audit: createMemoryAudit(),
  });
  const snapshot = async (): Promise<OfficeSnapshot> => ({ ...(await service.read()).snapshot, capabilities: { writes: true } });
  const observability = createObservability({ adapters: [adapter], read: service.read, prices: BUILT_IN_PRICES, nowMs: () => Date.now() });
  const corporate = createBudgetMonitor({
    config: DEMO_BUDGETS, people: async () => (await service.read()).snapshot.people, usageIn: observability.usageIn, nowMs: Date.now,
    pause: (personId, reason) => service.act(personId, { action: 'pause' }, 'corporate', reason),
  });

  async function observe(pathname: string, q: URLSearchParams): Promise<ApiResponse | null> {
    const person = TIMELINE.exec(pathname);
    if (person) {
      const params = timelineSince(q.get('since'), q.get('limit'), Date.now());
      if (!params.ok) return json(400, { error: params.error });
      const t = await observability.timeline(person[1] ?? '', { since: params.since, limit: params.limit });
      return t ? json(200, t) : notFound();
    }
    if (pathname !== '/api/usage') return null;
    const period = parsePeriod(q.get('period'));
    return period.ok ? json(200, await observability.usageReport(period.period)) : json(400, { error: period.error });
  }

  async function get(pathname: string, search: string): Promise<ApiResponse> {
    if (pathname === '/api/health') return json(200, { ok: true });
    if (pathname === '/api/office') return json(200, await snapshot());
    if (pathname === '/api/demo/clock') return json(200, adapter.demo.clock());
    if (pathname === '/api/budgets') return json(200, await corporate.check());
    if (pathname === '/api/unattributed') return json(200, unattributedReport(await service.read())); // Creed's corner
    const observed = await observe(pathname, new URLSearchParams(search));
    if (observed) return observed;
    const room = MESSAGES.exec(pathname);
    const roomId = room ? decode(room[1]) : '';
    const page = isRoomIdShape(roomId) ? await service.messages(roomId, MESSAGES_LIMIT) : null;
    if (!page) return notFound(); // also photos and headshots: the demo has none
    return json(200, page.messages, page.reason ? { 'X-DMOS-Messages-Reason': page.reason } : undefined);
  }

  async function post(pathname: string, body: unknown): Promise<ApiResponse> {
    if (typeof body !== 'object' || body === null || Array.isArray(body)) return json(400, { error: 'Body must be a JSON object' });
    const roomId = isRoomIdShape(field(body, 'roomId')) ? String(field(body, 'roomId')) : '';
    if (pathname === '/api/chat') {
      const result = await service.chat(roomId, field(body, 'text'));
      return result.ok ? json(200, result.value) : json(result.status, { error: result.error });
    }
    if (pathname === '/api/tasks') {
      const result = await service.createTask({ roomId, title: field(body, 'title'), assignee: field(body, 'assignee') });
      return result.ok ? json(201, result.value) : json(result.status, { error: result.error });
    }
    const person = ACTIONS.exec(pathname);
    if (person) {
      const result = await service.act(decode(person[1]), body, 'local');
      return result.ok ? json(200, result.value) : json(result.status, { error: result.error });
    }
    if (pathname === '/api/demo/clock') {
      const result = adapter.demo.setSpeed(field(body, 'speed'));
      return result.ok ? json(200, result.value) : json(result.status, { error: result.error });
    }
    return notFound();
  }

  function events(send: (update: OfficeUpdate) => void): () => void {
    let last: OfficeSnapshot | null = null;
    let open = true;
    let chain = Promise.resolve();
    const refresh = () => {
      chain = chain.then(async () => {
        const next = await snapshot();
        const update = last ? diffSnapshots(last, next) : fullUpdate(next);
        last = next;
        if (open && update) send(update);
      });
    };
    const off = service.subscribe(refresh);
    refresh();
    return () => {
      open = false;
      off();
    };
  }

  return {
    handle: (method, pathname, body, search = '') => (method === 'GET' ? get(pathname, search) : method === 'POST' ? post(pathname, body)
      : Promise.resolve(json(405, { error: 'Method not allowed' }))),
    events,
  };
}
