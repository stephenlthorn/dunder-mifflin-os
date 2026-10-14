// Control verbs and Corporate end to end: the browser, a REAL server (writes gate, controls, audit log, budgets) and a
// MOCK adapter. Every verb goes through the in-page confirmation; Cancel sends nothing; what was done is audited.
import { expect, test } from '@playwright/test';
import { person } from './helpers';
import { type ControlsServer, routeTo, startControlsServer } from './controlsServer';

let server: ControlsServer;
test.beforeEach(async ({ baseURL }) => {
  server = await startControlsServer({ pageOrigin: new URL(baseURL!).origin });
});
test.afterEach(async () => {
  await server.close();
});

const controlEvents = () => server.audit().filter((e) => String(e.event).startsWith('control.')).map((e) => [e.event, e.action, e.actor]);

test('pause asks first: Cancel sends nothing, Confirm pauses and is audited', async ({ page }) => {
  await routeTo(page, server);
  await page.goto('/');
  await person(page, /^Jim Halpert — /).click();
  const win = page.getByRole('dialog', { name: 'Jim Halpert' });
  const controls = win.getByRole('region', { name: 'Controls for Jim' });
  await controls.getByRole('button', { name: 'Pause' }).click();
  const confirm = win.getByTestId('control-confirm');
  await expect(confirm).toContainText('Pause Jim?');
  await expect(confirm.getByRole('button', { name: 'Pause' })).toBeFocused();
  await confirm.getByRole('button', { name: 'Cancel' }).click();
  await expect(confirm).toHaveCount(0);
  expect(server.calls()).toEqual([]);

  await controls.getByRole('button', { name: 'Pause' }).click();
  await win.getByTestId('control-confirm').getByRole('button', { name: 'Pause' }).click();
  await expect(win.getByRole('status')).toContainText('Paused Jim Halpert.');
  expect(server.calls()).toEqual(['pause:buyer']);
  expect(controlEvents()).toEqual([['control.request', 'pause', 'local'], ['control.done', 'pause', undefined]]);
});

test('Esc cancels a confirmation without closing the window', async ({ page }) => {
  await routeTo(page, server);
  await page.goto('/');
  await person(page, /^Jim Halpert — /).click();
  const win = page.getByRole('dialog', { name: 'Jim Halpert' });
  await win.getByRole('button', { name: 'Stop current run' }).click();
  await expect(win.getByTestId('control-confirm')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(win.getByTestId('control-confirm')).toHaveCount(0);
  await expect(win).toBeVisible();
  expect(server.calls()).toEqual([]);
});

test('run a job now, stop a running card and hand a card to another bot', async ({ page }) => {
  await routeTo(page, server);
  await page.goto('/');
  await person(page, /^Dwight Schrute — /).click();
  const win = page.getByRole('dialog', { name: 'Dwight Schrute' });
  const confirm = win.getByTestId('control-confirm');

  await win.getByRole('button', { name: 'Run “Morning sales report” now' }).click();
  await expect(confirm).toContainText('Run “Morning sales report” now?');
  await confirm.getByRole('button', { name: 'Run now' }).click();
  await expect(win.getByRole('status')).toContainText('Morning sales report: running now.');

  await win.getByRole('button', { name: 'Stop “Call Lackawanna County”' }).click();
  await confirm.getByRole('button', { name: 'Stop it' }).click();
  await expect(win.getByRole('status')).toContainText('Stopped Call Lackawanna County.');

  await win.getByRole('button', { name: 'Reassign “Fax the paper order”' }).click();
  await expect(confirm.getByRole('button', { name: 'Reassign' })).toBeDisabled();
  await confirm.getByRole('combobox').selectOption('jim');
  await confirm.getByRole('button', { name: 'Reassign' }).click();
  await expect(win.getByRole('status')).toContainText('Fax the paper order: now with Jim Halpert.');

  expect(server.calls()).toEqual(['run-job:seller:job-report', 'stop:seller:card-1', 'reassign:seller:card-2->buyer']);
  expect(server.audit().filter((e) => e.event === 'control.request').map((e) => [e.action, e.job ?? e.task, e.to])).toEqual([
    ['run-job', 'job-report', undefined], ['stop', 'card-1', undefined], ['reassign', 'card-2', 'jim'],
  ]);
});

test('Corporate freezes an over-budget bot (autoPause on) and badges the top bar; the ledger shows every budget', async ({ page, baseURL }) => {
  await server.close();
  server = await startControlsServer({ pageOrigin: new URL(baseURL!).origin, autoPause: true });
  await routeTo(page, server);
  await page.goto('/');
  const badge = page.getByTestId('corporate');
  await expect(badge).toContainText('1');
  await expect(badge).toHaveAttribute('aria-label', /1 over budget/);
  expect(server.calls()).toEqual(['pause:seller']);
  expect(server.audit()[0]).toMatchObject({ event: 'control.request', action: 'pause', actor: 'corporate', reason: 'Over its monthly budget ($25.00 of $20.00)' });
  await expect(person(page, /^Dwight Schrute — seller — offline/)).toBeVisible(); // the server pushed the paused bot to the map
  await badge.click();
  const ledger = page.getByRole('dialog', { name: 'Angela’s ledger' });
  const budgets = ledger.getByTestId('ledger-budgets');
  await expect(budgets.locator('[data-budget="dwight"]')).toContainText('Corporate froze the expense account');
  await expect(budgets.locator('[data-budget="dwight"]')).toContainText('$25.00 of $20.00 · 125%');
  await expect(budgets.locator('[data-budget="jim"]')).toContainText('$1.20 of $5.00 · 24%');
});

test('with autoPause off an over-budget bot only raises an alert: the need-you count and HR · Approvals', async ({ page, baseURL }) => {
  await server.close();
  server = await startControlsServer({ pageOrigin: new URL(baseURL!).origin, autoPause: false });
  await routeTo(page, server);
  await page.goto('/');
  await expect(page.getByTestId('corporate')).toBeVisible();
  await expect(page.getByTestId('need-you')).toContainText('1');
  await page.getByTestId('need-you').click();
  await expect(page.getByTestId('corporate-calls')).toContainText('Dwight Schrute Over budget: Corporate wants to talk to you. Auto-pause is off');
  expect(server.calls()).toEqual([]);
  await person(page, /^Dwight Schrute — /).click();
  await expect(page.getByRole('dialog', { name: 'Dwight Schrute' }).getByTestId('budget-gauge')).toContainText('This month$25.00 of $20.00 · 125%');
});

test('Ask Pam opens a verb\'s confirmation in the bot\'s window', async ({ page }) => {
  await routeTo(page, server);
  await page.goto('/');
  await expect(page.locator('[data-person]').first()).toBeVisible();
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Ask Pam' }).fill('pause jim');
  await expect(page.getByRole('option').first()).toContainText('Pause Jim');
  await page.keyboard.press('Enter');
  const win = page.getByRole('dialog', { name: 'Jim Halpert' });
  await expect(win.getByTestId('control-confirm')).toContainText('Pause Jim?');
  await win.getByRole('button', { name: 'Cancel' }).click();
  await win.getByRole('button', { name: 'Close Jim Halpert' }).click();
  await person(page, /^Jim Halpert — /).click(); // reopening the window does not ask again
  await expect(page.getByRole('dialog', { name: 'Jim Halpert' })).toContainText('Purchasing');
  await expect(page.getByTestId('control-confirm')).toHaveCount(0);
  expect(server.calls()).toEqual([]);
});

test('a read-only server offers no controls and refuses them anyway', async ({ page, baseURL }) => {
  await server.close();
  server = await startControlsServer({ pageOrigin: new URL(baseURL!).origin, readOnly: true });
  await routeTo(page, server);
  await page.goto('/');
  await person(page, /^Jim Halpert — /).click();
  const win = page.getByRole('dialog', { name: 'Jim Halpert' });
  await expect(win).toContainText('Purchasing');
  await expect(win.getByRole('region', { name: /Controls for/ })).toHaveCount(0);
  const res = await page.request.post(`${server.base}/api/people/jim/actions`, { data: { action: 'pause' }, headers: { origin: new URL(baseURL!).origin } });
  expect(res.status()).toBe(403);
  expect(server.calls()).toEqual([]); // Corporate could not pause dwight either: read-only
});
