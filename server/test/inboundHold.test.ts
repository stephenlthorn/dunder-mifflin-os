// Inbound endpoints may answer later (a Claude Code PermissionRequest held until you decide) and learn when the
// caller hangs up (its hook timed out), so a held request never outlives its caller.
import { afterEach, describe, expect, it } from 'vitest';
import { createServer, request, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { InboundRoute } from '../src/adapters/types.ts';
import { createInbound } from '../src/http/inbound.ts';

const TOKEN = 'held-token-0123456789abcdef';

function serve(route: InboundRoute): Promise<{ server: Server; port: number }> {
  const inbound = createInbound([route]);
  const server = createServer((req, res) => {
    const found = inbound.match(req.url ?? '');
    if (found) void inbound.handle(req, res, found, {});
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: (server.address() as AddressInfo).port })));
}

const route = (handle: InboundRoute['handle']): InboundRoute => ({
  pattern: /^\/api\/hooks\/test$/, maxBodyBytes: 1024, authorize: (h) => h.authorization === `Bearer ${TOKEN}`, handle,
});

const post = (port: number) => fetch(`http://127.0.0.1:${port}/api/hooks/test`, {
  method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' }, body: '{"x":1}',
});

let open: Server | null = null;
afterEach(async () => {
  await new Promise<void>((resolve) => (open ? (open.closeAllConnections(), open.close(() => resolve())) : resolve()));
  open = null;
});

describe('inbound endpoints that answer later', () => {
  it('waits for a handler that returns a promise and sends its JSON answer', async () => {
    const { server, port } = await serve(route(() => new Promise((resolve) => setTimeout(() => resolve({ status: 200, body: { decided: true } }), 30))));
    open = server;
    const res = await post(port);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ decided: true });
  });

  it('aborts the handler signal when the caller hangs up', async () => {
    let aborted: Promise<boolean> = Promise.resolve(false);
    const { server, port } = await serve(route(({ signal }) => {
      aborted = new Promise((resolve) => signal?.addEventListener('abort', () => resolve(true)));
      return new Promise((resolve) => signal?.addEventListener('abort', () => resolve({ status: 204 })));
    }));
    open = server;
    const req = request({ host: '127.0.0.1', port, path: '/api/hooks/test', method: 'POST', headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' } });
    req.on('error', () => undefined);
    req.end('{"x":1}');
    await new Promise((r) => setTimeout(r, 50));
    req.destroy();
    expect(await aborted).toBe(true);
  });
});
