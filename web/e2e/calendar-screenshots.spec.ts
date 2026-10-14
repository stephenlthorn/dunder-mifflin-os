// Docs screenshots of the Party Planning Committee calendar and the Conference Room minutes (demo data).
// Regenerated with `npm run screenshots` (not part of the normal e2e run).
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { noServer } from './helpers';

const out = (name: string) => fileURLToPath(new URL(`../../docs/screenshots/${name}`, import.meta.url));

test.use({ timezoneId: 'America/New_York' });

test.describe('@screenshot calendar and minutes', () => {
  test.beforeEach(async ({ page }) => {
    await noServer(page);
    await page.goto('/?demo=1');
    await expect(page.locator('[data-person]')).toHaveCount(23);
    await page.waitForTimeout(1200);
  });

  test('calendar week view', async ({ page }) => {
    await page.getByRole('button', { name: 'Party Planning Committee calendar' }).first().click();
    const win = page.getByRole('dialog', { name: 'Party Planning Committee' });
    await expect(win.getByTestId('cal-next')).toContainText('Next up');
    await win.getByRole('button', { name: /^Skool member digest, Andy Bernard, 7:00 AM, didn’t run/ }).click();
    await win.click({ position: { x: 300, y: 12 } });
    await page.screenshot({ path: out('ppc-calendar-week.png') });
  });

  test('calendar day view with a run picked', async ({ page }) => {
    await page.getByRole('button', { name: 'Party Planning Committee calendar' }).first().click();
    const win = page.getByRole('dialog', { name: 'Party Planning Committee' });
    await win.getByRole('button', { name: 'Day', exact: true }).click();
    await win.getByRole('button', { name: /^Trend scan, Ryan Howard/ }).click();
    await win.click({ position: { x: 300, y: 12 } });
    await page.screenshot({ path: out('ppc-calendar-day.png') });
  });

  test('minutes list and memo', async ({ page }) => {
    await page.getByRole('button', { name: /^Conference Room — / }).click();
    const win = page.getByRole('dialog', { name: /^Conference Room — / });
    await win.getByRole('tab', { name: 'Minutes' }).click();
    await expect(win.getByTestId('minutes')).toBeVisible();
    await page.screenshot({ path: out('minutes-list.png') });
    await win.getByRole('button', { name: /^Council 2026-10-09/ }).click();
    await expect(win.getByTestId('memo')).toBeVisible();
    await page.screenshot({ path: out('minutes-memo.png') });
  });
});
