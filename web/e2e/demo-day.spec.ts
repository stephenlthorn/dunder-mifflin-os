// The demo day ("Threat Level Midnight") in the browser: demo.html runs the scripted day with no server at all.
// ?at=HH:MM starts the day just before the moment under test; at 60x an office minute is a real second.
import { expect, test } from '@playwright/test';
import { REPLIES } from '../../shared/demo/lines';
import { apiRequests, officeMinutes, seatOf } from './demoDay';
import { noServer, person } from './helpers';

test.beforeEach(async ({ page }) => {
  await noServer(page); // nothing may reach a server: the in-browser office answers every /api call
});

test.describe('the demo day', () => {
  test('shows the badge, the office clock and every staff member; unbotted staff have no bot yet', async ({ page }) => {
    const calls = apiRequests(page);
    await page.goto('/demo.html?at=09:10');
    await expect(page.getByTestId('demo-badge')).toHaveText('DEMO · Threat Level Midnight');
    await expect(page.getByTestId('source')).toHaveCount(0);
    await expect(page.locator('[data-person]')).toHaveCount(23);
    await expect(person(page, 'Jim Halpert — no bot yet')).toBeVisible();
    await expect(person(page, 'Dwight Schrute — sales — working')).toBeVisible();
    expect(await officeMinutes(page)).toBeGreaterThanOrEqual(9 * 60 + 10);
    expect(calls).toEqual([]);
  });

  test('a Council meeting happens: the bots walk to the Conference Room and talk it through', async ({ page }) => {
    await page.goto('/demo.html?at=10:25'); // the Council starts at 10:30: five seconds later at 60x
    await expect(page.locator('[data-person="michael"]')).toBeVisible();
    expect(await seatOf(page, 'michael')).not.toMatch(/^seat\.conf\./);
    await expect.poll(() => seatOf(page, 'michael'), { timeout: 12_000 }).toMatch(/^seat\.conf\./);
    for (const id of ['angela', 'oscar', 'david', 'pam']) expect(await seatOf(page, id), id).toMatch(/^seat\.conf\./);
    await expect(person(page, 'Michael Scott — manager — in a meeting')).toBeVisible();
    await page.getByRole('button', { name: /^Conference Room — / }).click();
    await page.getByRole('dialog', { name: /^Conference Room — / }).getByRole('tab', { name: 'Council' }).click();
    const council = page.getByRole('dialog', { name: 'Conference Room — Council room' });
    await expect(council.locator('.task-list')).toContainText('Q4 pricing review');
    await expect(council.locator('.msg').first()).toContainText('Council at 10:30', { timeout: 10_000 });
  });

  test("an error appears (Kevin's chili), then a bot waits for you", async ({ page }) => {
    await page.goto('/demo.html?at=10:50');
    await expect(person(page, 'Kevin Malone — imports — error')).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('fleet-error')).toContainText('1');
    await person(page, /^Kevin Malone — /).click();
    const kevin = page.getByRole('dialog', { name: 'Kevin Malone' });
    await expect(kevin.getByTestId('status-line')).toContainText('Error');
    await expect(kevin).toContainText('Spilled chili on the import');
    await expect(kevin).toContainText('Vendor price import'); // the scheduled job that spilled
    await page.goto('/demo.html?at=10:57');
    await expect(person(page, 'Dwight Schrute — sales — needs you')).toBeVisible({ timeout: 8000 });
  });

  test('the speed control slows the day to 1x and speeds it back up to 60x', async ({ page }) => {
    await page.goto('/demo.html?at=09:00');
    const speed = page.getByRole('group', { name: 'Demo speed' });
    await expect(speed.getByRole('button', { name: '60×' })).toHaveAttribute('aria-pressed', 'true');
    await speed.getByRole('button', { name: '1×' }).click();
    await expect(speed.getByRole('button', { name: '1×' })).toHaveAttribute('aria-pressed', 'true');
    const slow = await officeMinutes(page);
    await page.waitForTimeout(2500);
    expect(await officeMinutes(page) - slow).toBeLessThanOrEqual(1);
    await speed.getByRole('button', { name: '60×' }).click();
    await expect.poll(() => officeMinutes(page), { timeout: 8000 }).toBeGreaterThanOrEqual(slow + 4);
  });

  test('bots answer in character, and a new shared task is worked in the Conference Room', async ({ page }) => {
    await page.goto('/demo.html?at=09:40');
    await person(page, /^Dwight Schrute — /).click();
    const dwight = page.getByRole('dialog', { name: 'Dwight Schrute' });
    await dwight.getByLabel('Message Direct line').fill('How are the leads?');
    await dwight.getByRole('button', { name: 'Send' }).click();
    await expect(dwight.getByLabel('Dwight is typing')).toBeVisible();
    const reply = dwight.locator('.msg:not(.mine) .msg-text').last();
    await expect(reply).toBeVisible();
    expect(REPLIES.sales).toContain(await reply.innerText());

    await page.getByRole('button', { name: /^Conference Room — / }).click();
    const ops = page.getByRole('dialog', { name: 'Conference Room — Ops room' });
    await ops.getByLabel('Task title').fill('Restock the copier');
    await ops.getByLabel('Assignee').selectOption('social');
    await ops.getByRole('button', { name: 'Create' }).click();
    await expect(ops.locator('.task-list')).toContainText('Restock the copier');
    await expect.poll(() => seatOf(page, 'kelly'), { timeout: 15_000 }).toMatch(/^seat\.conf\./); // picked up 10 office minutes later
  });
});
