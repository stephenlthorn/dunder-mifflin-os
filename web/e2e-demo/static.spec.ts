// The static demo (`npm run build:demo-static`) served by a plain file server under a sub-path, like GitHub Pages:
// no server behind it, so every /api call must be answered in the browser.
import { expect, test } from '@playwright/test';
import { apiRequests, officeMinutes, seatOf } from '../e2e/demoDay';
import { person } from '../e2e/helpers';

test('loads from a sub-path with nothing but static files, and runs the day', async ({ page }) => {
  const calls = apiRequests(page);
  const failures: string[] = [];
  const errors: string[] = [];
  page.on('response', (r) => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./?at=10:25');
  await expect(page.getByTestId('demo-badge')).toHaveText('DEMO · Threat Level Midnight');
  await expect(page.locator('[data-person]')).toHaveCount(23);
  await expect(person(page, 'Jim Halpert — no bot yet')).toBeVisible();
  await expect.poll(() => seatOf(page, 'michael'), { timeout: 12_000 }).toMatch(/^seat\.conf\./); // the Council at 10:30

  await person(page, /^Pam Beesly — /).click();
  const pam = page.getByRole('dialog', { name: 'Pam Beesly' });
  await pam.getByLabel('Message Direct line').fill('Any messages for me?');
  await pam.getByRole('button', { name: 'Send' }).click();
  await expect(pam.locator('.msg:not(.mine)').last()).toBeVisible();

  expect(calls).toEqual([]);
  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});

test('the speed control works without a server', async ({ page }) => {
  await page.goto('./?at=09:00&speed=1');
  const speed = page.getByRole('group', { name: 'Demo speed' });
  await expect(speed.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'true');
  const start = await officeMinutes(page);
  await speed.getByRole('button', { name: '60×' }).click();
  await expect.poll(() => officeMinutes(page), { timeout: 8000 }).toBeGreaterThanOrEqual(start + 4);
});
