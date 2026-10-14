// Regenerates docs/screenshots with `npm run screenshots` (not part of the normal e2e run). Every shot is the demo day
// ("Threat Level Midnight", demo.html: fictional, no server) at 11:05 office time, with the browser clock paused so
// the shots come out the same each time: the Council is in session, Kevin's import has spilled, Dwight needs you.
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { noServer, person } from './helpers';

const out = (name: string) => fileURLToPath(new URL(`../../docs/screenshots/${name}`, import.meta.url));
const T0 = new Date('2026-10-13T12:00:00.000Z');

/** The demo day at 11:05, frozen: time moves only when the test says (runFor), so every run looks the same. */
async function openDemoDay(page: Page) {
  await noServer(page);
  await page.clock.install({ time: T0 });
  await page.clock.pauseAt(new Date(T0.getTime() + 1000));
  await page.goto('/demo.html?at=11:05&speed=60');
  await page.clock.runFor(500);
}

test.describe('@screenshot docs screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await openDemoDay(page);
    await expect(page.locator('[data-person]')).toHaveCount(23);
    await expect(page.getByTestId('demo-clock')).toContainText('11:05');
    await page.waitForTimeout(1600); // let the walk-in / chip layout settle
  });

  test('Ask Pam palette', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByRole('combobox', { name: 'Ask Pam' }).fill('dw');
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(200);
    await page.screenshot({ path: out('ask-pam.png') });
  });

  test('full office map', async ({ page }) => {
    await page.screenshot({ path: out('office-map.png') });
  });

  test('person window', async ({ page }) => {
    await person(page, 'Dwight Schrute — sales — needs you').click();
    const win = page.getByRole('dialog', { name: 'Dwight Schrute' });
    await win.getByLabel('Message Direct line').fill('Go ahead and send them.');
    await win.getByRole('button', { name: 'Send' }).click();
    await page.clock.runFor(1000); // the canned reply "types" for a moment
    await expect(win.locator('.msg:not(.mine)').last()).toBeVisible();
    await page.screenshot({ path: out('person-window.png') });
  });

  test('room window', async ({ page }) => {
    await page.getByRole('button', { name: /^Conference Room — / }).click();
    await page.getByRole('dialog', { name: 'Conference Room — Ops room' }).getByRole('tab', { name: 'Council' }).click();
    await page.screenshot({ path: out('room-window.png') });
  });

  test('bullpen close-up', async ({ page }) => {
    await page.mouse.move(560, 560); // reception and the Jim/Dwight desks
    for (let i = 0; i < 2; i += 1) {
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: out('bullpen-closeup.png') });
  });
});

test.describe('@screenshot docs screenshots at phone width', () => {
  test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  test.beforeEach(async ({ page }) => {
    await openDemoDay(page);
    await expect(page.locator('.list-row')).toHaveCount(23);
  });

  test('mobile list view', async ({ page }) => {
    await page.screenshot({ path: out('mobile-list.png') });
  });

  test('mobile person sheet', async ({ page }) => {
    await page.getByRole('button', { name: /^Dwight Schrute — / }).tap();
    await expect(page.getByRole('dialog', { name: 'Dwight Schrute' })).toBeVisible();
    await page.screenshot({ path: out('mobile-person-sheet.png') });
  });
});
