// Scans every /api/* response (snapshot, SSE, messages, timelines, usage) built from the REAL ~/.hermes (read-only) for chat ids, tokens, phone numbers and
// Hermes paths. Skipped when ~/.hermes is absent (CI, other machines). Never prints what it finds, only the kind.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { createApp, type App } from '../src/http/app.ts';
import { headshotsDirFrom } from '../src/config.ts';
import { createHermesAdapter } from '../src/adapters/hermes.ts';
import { createLiveSource } from '../src/hermes/liveSource.ts';
import type { Runner } from '../src/chat/runner.ts';
import type { OfficeSnapshot } from '../../shared/contract.ts';
import { LEAK_PATTERNS, knownChatIds, scanForLeaks } from './helpers/leakScan.ts';

const HOME = process.env.HERMES_HOME ?? path.join(os.homedir(), '.hermes');
const hasHermes = existsSync(path.join(HOME, 'profiles'));
const STATUS_URL = process.env.DMOS_STATUS_URL ?? 'http://127.0.0.1:9119/api/status';
const neverRun: Runner = async () => { throw new Error('the leak scan must not run hermes'); };

async function firstSseFrame(url: string): Promise<string> {
  const ctrl = new AbortController();
  const res = await fetch(url, { signal: ctrl.signal });
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let text = '';
  while (!/^data: .*\n\n/m.test(text)) {
    const { value, done } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  ctrl.abort();
  return text;
}

describe('leak patterns', () => {
  it('catch the shapes they are meant to catch, and not ISO times, colours or ids', () => {
    const hit = (s: string) => LEAK_PATTERNS.filter(([, re]) => re.test(s)).map(([k]) => k);
    expect(hit('chat -1001234567890')).toContain('telegram chat id');
    expect(hit('call +1 570 555 0123')).toContain('phone number (international)');
    expect(hit('call (570) 555-0123')).toContain('phone number (US style)');
    expect(hit('see ~/.hermes/profiles/tech/config.yaml')).toContain('~/.hermes path');
    expect(hit('123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawz')).toContain('telegram bot token');
    expect(hit('{"at":"2026-10-13T16:42:43.672Z","look":{"skin":"#141010"},"id":"tech-4521"}')).toEqual([]);
  });
});

describe.skipIf(!hasHermes)('live ~/.hermes: nothing secret leaves /api/*', () => {
  let app: App;
  let base: string;
  beforeAll(async () => {
    app = createApp({
      adapters: [createHermesAdapter({ source: createLiveSource({ hermesHome: HOME, statusUrl: STATUS_URL }), runner: neverRun, hermesBin: '/nonexistent/hermes' })],
      hermesHome: HOME, headshotDir: headshotsDirFrom(process.env.DMOS_HEADSHOTS_DIR, os.homedir()), pollIntervalMs: 60_000,
    });
    await new Promise<void>((resolve) => app.server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  });
  afterAll(async () => { await app?.close(); });

  it('scans the snapshot, the SSE stream, the approvals inbox, every room\'s messages, the schedule and the minutes', async () => {
    const chatIds = knownChatIds(HOME);
    const officeRes = await fetch(`${base}/api/office`);
    const officeText = await officeRes.text();
    const snap = JSON.parse(officeText) as OfficeSnapshot;
    expect(snap.people).toHaveLength(23);
    const pages: Array<[string, string]> = [
      ['/api/office', officeText], ['/api/events', await firstSseFrame(`${base}/api/events`)],
      ['/api/approvals', await (await fetch(`${base}/api/approvals`)).text()], // read-only: the runner never runs
    ];
    for (const room of snap.rooms) {
      const where = `/api/rooms/${room.id}/messages`;
      const res = await fetch(`${base}${where}`);
      expect(res.status, where).toBe(200);
      pages.push([where, `${res.headers.get('x-dmos-messages-reason') ?? ''}\n${await res.text()}`]);
    }
    for (const where of ['/api/schedule', '/api/meetings']) {
      const res = await fetch(`${base}${where}`);
      expect(res.status, where).toBe(200);
      pages.push([where, await res.text()]);
    }
    const hits = pages.flatMap(([where, text]) => scanForLeaks(where, text, chatIds, HOME));
    expect(hits).toEqual([]);
  });

  it('scans every bot\'s 7-day timeline and the 30-day usage ledger', async () => {
    const chatIds = knownChatIds(HOME);
    const snap = await (await fetch(`${base}/api/office`)).json() as OfficeSnapshot;
    const since = encodeURIComponent(new Date(Date.now() - 7 * 86_400_000).toISOString());
    const paths = [...snap.people.filter((p) => p.bot).map((p) => `/api/people/${p.id}/timeline?since=${since}&limit=1000`), '/api/usage?period=30d'];
    const pages = await Promise.all(paths.map(async (where): Promise<[string, string]> => {
      const res = await fetch(`${base}${where}`);
      expect(res.status, where).toBe(200);
      // token counts pass a billion: blank those numeric fields so the digit-run rule still guards everything else
      return [where.split('?')[0]!, (await res.text()).replace(/"(inputTokens|outputTokens|cacheReadTokens|cacheWriteTokens|calls)":\d+/g, '"$1":0')];
    }));
    expect(pages.flatMap(([where, text]) => scanForLeaks(where, text, chatIds, HOME))).toEqual([]);
  });
});
