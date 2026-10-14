import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { createApp, type App } from '../src/http/app.ts';
import { createHermesAdapter } from '../src/adapters/hermes.ts';
import { createFixtureSource, loadFixture } from '../src/hermes/fixtureSource.ts';
import type { HermesSource, HermesState } from '../src/hermes/types.ts';

const fixture = loadFixture();
const T = Date.parse(fixture.state.recordedAt) / 1000;
const inner = createFixtureSource({ fixture });
let override: ((s: HermesState) => HermesState) | null = null;
const source: HermesSource = {
  kind: 'fixture',
  readState: async () => (override ? override(await inner.readState()) : inner.readState()),
  readMessages: (q) => inner.readMessages(q),
};

let app: App;
let base: string;
beforeAll(async () => {
  const runner = async () => ({ stdout: '', stderr: '', code: 0, timedOut: false });
  app = createApp({
    adapters: [createHermesAdapter({ source, runner, hermesBin: 'h', now: () => T })],
    hermesHome: '/nonexistent', headshotDir: '/nonexistent', pollIntervalMs: 40, now: () => T,
  });
  await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
});
afterAll(() => app.close());

async function* events(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of body) {
    buffer += decoder.decode(chunk, { stream: true });
    const parts = buffer.split('\n\n');
    buffer = parts.pop() ?? '';
    for (const part of parts) {
      const data = part.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n');
      if (data) yield JSON.parse(data);
    }
  }
}

describe('GET /api/events (SSE)', () => {
  it('sends the full state first, then only what changed', async () => {
    const controller = new AbortController();
    const res = await fetch(`${base}/api/events`, { signal: controller.signal });
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    const stream = events(res.body as ReadableStream<Uint8Array>);

    const first = (await stream.next()).value as { presence: Record<string, { status: string }>; tasks: unknown[] };
    expect(Object.keys(first.presence)).toHaveLength(23);
    expect(first.presence.ira?.status).toBe('offline');
    expect(Array.isArray(first.tasks)).toBe(true);
    expect(app.clientCount()).toBe(1);

    override = (s) => ({
      ...s,
      gateway: s.gateway && { ...s.gateway, platforms: s.gateway.platforms.map((p) => (p.profile === 'health' ? { ...p, state: 'connected' } : p)) },
    });
    const second = (await stream.next()).value as { presence?: Record<string, { status: string }>; tasks?: unknown };
    expect(Object.keys(second.presence ?? {})).toEqual(['ira']);
    expect(second.presence?.ira?.status).not.toBe('offline');
    expect(second.tasks).toBeUndefined();

    controller.abort();
    await new Promise((r) => setTimeout(r, 50));
    expect(app.clientCount()).toBe(0);
    override = null;
  });
});
