// The one-time sign-in page for remote access: a plain HTML form (no JavaScript), strict headers.
import type { ServerResponse } from 'node:http';
import { BASE_HEADERS } from './respond.ts';

export const LOGIN_PATH = '/login';

const LOGIN_HEADERS: Readonly<Record<string, string>> = {
  ...BASE_HEADERS,
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
  'X-Frame-Options': 'DENY',
  // A form POST under `no-referrer` carries `Origin: null`, which the write guard refuses; same-origin keeps it.
  'Referrer-Policy': 'same-origin',
};

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const STYLE = `
  :root { color-scheme: light dark; --bg: #eef1f5; --card: #fff; --ink: #1d2733; --muted: #5b6776; --line: #c9d1db;
    --brand: #1f4e8c; --error: #b3261e; }
  @media (prefers-color-scheme: dark) { :root { --bg: #14181d; --card: #1e242b; --ink: #e8edf3; --muted: #a3afbd;
    --line: #36404b; --brand: #6ea2e8; --error: #f2867e; } }
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 16px; background: var(--bg); color: var(--ink);
    font: 15px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { width: 100%; max-width: 380px; background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 24px; }
  h1 { margin: 0 0 4px; font-size: 20px; } h1 strong { color: var(--brand); }
  p { margin: 0 0 16px; color: var(--muted); }
  label { display: block; font-weight: 600; margin-bottom: 6px; }
  input { width: 100%; padding: 10px 12px; font: inherit; color: inherit; background: transparent; border: 1px solid var(--line); border-radius: 8px; }
  button { margin-top: 14px; width: 100%; padding: 10px 12px; font: inherit; font-weight: 600; color: #fff; background: var(--brand); border: 0; border-radius: 8px; cursor: pointer; }
  .error { color: var(--error); font-weight: 600; }
`;

export function loginPageHtml(opts: { next: string; error?: string }): string {
  const error = opts.error ? `<p class="error" role="alert">${escapeHtml(opts.error)}</p>` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Sign in · Dunder Mifflin OS</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>Dunder Mifflin <strong>OS</strong></h1>
<p>This office is reachable from other devices, so it asks for its access token once per browser.</p>
${error}<form method="post" action="${LOGIN_PATH}">
<label for="token">Access token</label>
<input id="token" name="token" type="password" autocomplete="current-password" required autofocus>
<input type="hidden" name="next" value="${escapeHtml(opts.next)}">
<button type="submit">Sign in</button>
</form>
</main>
</body>
</html>
`;
}

export function sendLoginPage(res: ServerResponse, status: number, opts: { next: string; error?: string }, extra: Readonly<Record<string, string>> = {}): void {
  const body = loginPageHtml(opts);
  res.writeHead(status, { ...LOGIN_HEADERS, 'Content-Length': Buffer.byteLength(body), ...extra });
  res.end(body);
}
