// Control verbs and Corporate in the static demo (no server): verbs reach the in-browser demo bots, and the budgets
// come from the demo day's scripted usage. At 16:45 Kelly is over her daily budget and Kevin's model has no price.
import { expect, test } from '@playwright/test';
import { person } from '../e2e/helpers';

test('runs a job now and shows Corporate\'s budgets without a server', async ({ page }) => {
  const failures: string[] = [];
  const errors: string[] = [];
  page.on('response', (r) => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('./?at=16:45&speed=1');
  await expect(page.locator('[data-person]')).toHaveCount(23);

  const badge = page.getByTestId('corporate');
  await expect(badge).toHaveAttribute('aria-label', /1 over budget/);
  await badge.click();
  const budgets = page.getByRole('dialog', { name: 'Angela’s ledger' }).getByTestId('ledger-budgets');
  await expect(budgets.locator('[data-budget="kelly"]')).toContainText('Over budget: Corporate wants to talk to you');
  await expect(budgets.locator('[data-budget="kevin"]')).toContainText('can’t price chili-7b-local');

  await person(page, /^Sadiq — /).click();
  const sadiq = page.getByRole('dialog', { name: 'Sadiq' });
  await expect(sadiq.getByRole('region', { name: 'Controls for Sadiq' })).toContainText('can’t be paused from here');
  await sadiq.getByRole('button', { name: 'Run “Fleet health check” now' }).click();
  await sadiq.getByTestId('control-confirm').getByRole('button', { name: 'Run now' }).click();
  await expect(sadiq.getByRole('status')).toContainText('Fleet health check: running now.');

  expect(failures).toEqual([]);
  expect(errors).toEqual([]);
});
