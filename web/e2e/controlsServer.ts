// Starts server/scripts/e2e-controls-server.ts: a REAL Dunder Mifflin OS server in front of a MOCK adapter (nothing
// talks to Hermes). The browser's /api requests are routed to it with route.continue, so SSE streams through too.
// What the mock adapter received and what was audited are read from the files the server writes.
import { type ChildProcess, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SCRIPT = path.join(ROOT, 'server', 'scripts', 'e2e-controls-server.ts');

export type ControlsServer = {
  base: string;
  calls: () => string[]; // verbs the mock adapter received, in order
  audit: () => Array<Record<string, unknown>>; // the audit log's entries
  close: () => Promise<void>;
};

const lines = (file: string): string[] => {
  try {
    return readFileSync(file, 'utf8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
};

export async function startControlsServer(opts: { pageOrigin: string; readOnly?: boolean; autoPause?: boolean }): Promise<ControlsServer> {
  const flags = [...(opts.readOnly ? ['--read-only'] : []), ...(opts.autoPause ? ['--auto-pause'] : [])];
  const child: ChildProcess = spawn(process.execPath, ['--import', 'tsx', SCRIPT, '--origin', opts.pageOrigin, ...flags], {
    cwd: path.join(ROOT, 'server'), env: { ...process.env, DMOS_QUIET: '1', NODE_OPTIONS: '--disable-warning=ExperimentalWarning' }, stdio: ['ignore', 'pipe', 'inherit'],
  });
  const first = await new Promise<string>((resolve, reject) => {
    const rl = createInterface({ input: child.stdout! });
    rl.once('line', (line) => { rl.close(); resolve(line); });
    child.once('exit', (code) => reject(new Error(`the e2e controls server exited (${code})`)));
  });
  const { port, dir } = JSON.parse(first) as { port: number; dir: string };
  return {
    base: `http://127.0.0.1:${port}`,
    calls: () => lines(path.join(dir, 'calls.log')),
    audit: () => lines(path.join(dir, 'audit.log')).map((l) => JSON.parse(l) as Record<string, unknown>),
    close: () => new Promise<void>((resolve) => {
      if (child.exitCode !== null) return resolve();
      child.once('exit', () => resolve());
      child.kill('SIGTERM');
    }),
  };
}

/** Send the page's /api requests to the real server (portraits and headshots: none). */
export async function routeTo(page: Page, server: ControlsServer) {
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    if (/^\/api\/(portraits|headshots)\//.test(url.pathname)) return route.fulfill({ status: 404, body: '' });
    return route.continue({ url: `${server.base}${url.pathname}${url.search}` });
  });
}
