// GET /api/events. Polls the adapters every `intervalMs` while at least one client is connected (and sooner when a
// push adapter pokes it) and pushes `{ presence?, tasks?, approvals? }` when something changed. A new client first gets them all.
// Clients MERGE presence by person id and REPLACE tasks and approvals.
import type { ServerResponse } from 'node:http';
import type { OfficeSnapshot } from '../../../shared/contract.ts';
import { diffSnapshots, fullUpdate, type OfficeUpdate } from '../domain/diff.ts';
import { log, redact } from '../log.ts';
import { BASE_HEADERS } from './respond.ts';

export type SseHub = {
  add(res: ServerResponse, headers: Readonly<Record<string, string>>): Promise<void>;
  refresh(): Promise<void>;
  /** Something changed (a push adapter got an event): refresh soon, coalescing bursts, if anyone is listening. */
  poke(): void;
  clientCount(): number;
  close(): void;
};

const HEARTBEAT_MS = 25_000;
const POKE_DELAY_MS = 150;

export function createSseHub(opts: { load: () => Promise<OfficeSnapshot>; intervalMs: number }): SseHub {
  let clients: ReadonlySet<ServerResponse> = new Set();
  let last: OfficeSnapshot | null = null;
  let poller: NodeJS.Timeout | null = null;
  let heartbeat: NodeJS.Timeout | null = null;
  let polling: Promise<void> | null = null;
  let poked: NodeJS.Timeout | null = null;

  const send = (res: ServerResponse, update: OfficeUpdate) => res.write(`data: ${JSON.stringify(update)}\n\n`);

  async function pollOnce(): Promise<void> {
    try {
      const next = await opts.load();
      const update = last ? diffSnapshots(last, next) : fullUpdate(next);
      last = next;
      if (update) for (const c of clients) send(c, update);
    } catch (error) {
      log('sse.poll_failed', { detail: redact(error instanceof Error ? error.message : String(error)) });
    }
  }

  function refresh(): Promise<void> {
    polling ??= pollOnce().finally(() => { polling = null; });
    return polling;
  }

  function poke(): void {
    if (clients.size === 0 || poked) return;
    poked = setTimeout(() => {
      poked = null;
      void refresh();
    }, POKE_DELAY_MS);
  }

  function start(): void {
    poller ??= setInterval(() => void refresh(), opts.intervalMs);
    heartbeat ??= setInterval(() => { for (const c of clients) c.write(': ping\n\n'); }, HEARTBEAT_MS);
  }

  function stop(): void {
    if (poller) clearInterval(poller);
    if (heartbeat) clearInterval(heartbeat);
    if (poked) clearTimeout(poked);
    poller = null;
    heartbeat = null;
    poked = null;
    last = null; // the next first client gets a fresh baseline
  }

  async function add(res: ServerResponse, headers: Readonly<Record<string, string>>): Promise<void> {
    res.writeHead(200, { ...BASE_HEADERS, ...headers, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive' });
    res.write('retry: 3000\n\n');
    clients = new Set([...clients, res]);
    res.on('close', () => {
      clients = new Set([...clients].filter((c) => c !== res));
      if (clients.size === 0) stop();
    });
    start();
    if (last) send(res, fullUpdate(last));
    else await refresh(); // first poll broadcasts the full update to every client, this one included
  }

  function close(): void {
    stop();
    for (const c of clients) c.end();
    clients = new Set();
  }

  return { add, refresh, poke, clientCount: () => clients.size, close };
}
