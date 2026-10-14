// Helpers for the demo-day e2e tests (web/e2e/demo-day.spec.ts, web/e2e-demo/*).
import type { Page } from '@playwright/test';

/** The seat a person is drawn in ('seat.conf.3' when they are in the Conference Room). */
export const seatOf = (page: Page, personId: string) =>
  page.locator(`[data-person="${personId}"]`).evaluate((el) => el.closest('[data-seat]')?.getAttribute('data-seat') ?? null);

/** The office clock in the top bar, as minutes since midnight ("9:05 AM" -> 545). */
export async function officeMinutes(page: Page): Promise<number> {
  const text = (await page.getByTestId('demo-clock').innerText()).replace('Office time', '').trim();
  const m = /^(\d{1,2}):(\d{2})\s*([AP]M)$/.exec(text);
  if (!m) throw new Error(`unexpected office time "${text}"`);
  const hour = (Number(m[1]) % 12) + (m[3] === 'PM' ? 12 : 0);
  return hour * 60 + Number(m[2]);
}

/** Every request the page makes to an /api path (the static demo should make none). */
export function apiRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (r) => {
    if (new URL(r.url()).pathname.includes('/api/')) seen.push(r.url());
  });
  return seen;
}
