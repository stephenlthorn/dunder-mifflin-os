import type { Page, Route } from '@playwright/test';
import type { OfficeSnapshot } from '../../shared/contract';
import { DEMO_SNAPSHOT } from '../../shared/fixtures/demo-snapshot';

/** Make the API unreachable, as if the server were not running. */
export async function noServer(page: Page) {
  await page.route('**/api/**', (route: Route) => route.abort('connectionrefused'));
}

/** Serve a live snapshot and a scripted SSE stream (each event is one `data:` frame). */
export async function liveServer(page: Page, events: unknown[] = [], snapshot: OfficeSnapshot = DEMO_SNAPSHOT) {
  await page.route('**/api/office', (route) => route.fulfill({ json: snapshot }));
  await page.route('**/api/events', (route) => route.fulfill({
    status: 200,
    headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
    body: `retry: 60000\n\n${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}`,
  }));
  await page.route('**/api/rooms/*/messages', (route) => route.fulfill({ json: [], headers: { 'X-DMOS-Messages-Reason': 'No messages in this room yet.' } }));
  await page.route('**/api/headshots/*', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route('**/api/portraits/*', (route) => route.fulfill({ status: 404, body: '' }));
}

export const person = (page: Page, name: string | RegExp) => page.getByRole('button', { name });
