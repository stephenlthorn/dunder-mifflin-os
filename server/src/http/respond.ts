// Response helpers: JSON bodies, error envelopes ({ error }), and headers every response carries.
import type { ServerResponse } from 'node:http';

export const BASE_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-site',
};

export function sendJson(res: ServerResponse, status: number, body: unknown, headers: Readonly<Record<string, string>> = {}): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    ...BASE_HEADERS, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(payload), ...headers,
  });
  res.end(payload);
}

export function sendError(res: ServerResponse, status: number, error: string, headers: Readonly<Record<string, string>> = {}): void {
  sendJson(res, status, { error }, headers);
}
