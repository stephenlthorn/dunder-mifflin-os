// Control verbs and Corporate on the real server running the demo day (DMOS_SOURCE=demo): verbs reach only the
// in-memory demo bots, and the demo brings its own budgets (alerts only; demo bots can't be paused).
import { expect, test } from '@playwright/test';
import type { BudgetsReport } from '../../shared/controls';
import { person } from '../e2e/helpers';

test('runs a job now, refuses pause, and reports the demo budgets', async ({ page, request }) => {
  const report = await (await request.get('/api/budgets')).json() as BudgetsReport;
  expect(report.autoPause).toBe(false);
  expect(report.budgets.map((b) => b.personId).sort()).toEqual(['dwight', 'kelly', 'kevin', 'michael']);

  await page.goto('/');
  await expect(page.locator('[data-person]')).toHaveCount(23);
  await person(page, /^Sadiq — /).click();
  const sadiq = page.getByRole('dialog', { name: 'Sadiq' });
  await sadiq.getByRole('button', { name: 'Run “Fleet health check” now' }).click();
  const confirm = sadiq.getByTestId('control-confirm');
  await expect(confirm).toContainText('Run “Fleet health check” now?');
  await confirm.getByRole('button', { name: 'Run now' }).click();
  await expect(sadiq.getByRole('status')).toContainText(/Fleet health check: running now\.|That job is already running/);
  expect((await request.post('/api/people/sadiq/actions', { data: { action: 'pause' } })).status()).toBe(501);
});
