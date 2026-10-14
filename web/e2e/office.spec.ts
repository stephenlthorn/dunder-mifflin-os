import { expect, test } from '@playwright/test';
import { STAFF } from '../../shared/office';
import { liveServer, noServer, person } from './helpers';

test.describe('the office map', () => {
  test('renders all 23 people, each a labelled button', async ({ page }) => {
    await noServer(page);
    await page.goto('/?demo=1');
    const people = page.locator('[data-person]');
    await expect(people).toHaveCount(23);
    for (const s of STAFF) {
      const el = page.locator(`[data-person="${s.id}"]`);
      await expect(el).toHaveAttribute('role', 'button');
      await expect(el).toHaveAttribute('aria-label', new RegExp(`^${s.name} — `));
    }
    await expect(person(page, 'Dwight Schrute — campaigns — working')).toBeVisible();
    await expect(person(page, 'Jim Halpert — no bot yet')).toBeVisible();
  });

  test('clicking Dwight opens his window with his status', async ({ page }) => {
    await noServer(page);
    await page.goto('/?demo=1');
    await person(page, 'Dwight Schrute — campaigns — working').click();
    const win = page.getByRole('dialog', { name: 'Dwight Schrute' });
    await expect(win).toBeVisible();
    await expect(win.getByTestId('status-line')).toContainText('Working');
    await expect(win).toContainText('Auditing the Q4 campaign report');
    await expect(win).toContainText('Campaigns (audit & report)');
    await expect(win).toContainText('Chat room: Direct line — Bullpen');
    await expect(win).toContainText('Weekly campaign report');
    await expect(page.getByRole('navigation', { name: 'Open windows' }).getByRole('button', { name: 'Dwight Schrute' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(win).toBeHidden();
  });

  test('clicking the Conference Room opens the Ops room, with Council as a second tab', async ({ page }) => {
    await noServer(page);
    await page.goto('/?demo=1');
    await page.getByRole('button', { name: /^Conference Room — / }).click();
    const win = page.getByRole('dialog', { name: 'Conference Room — Ops room' });
    await expect(win).toBeVisible();
    await expect(win.getByRole('tab', { name: 'Ops' })).toHaveAttribute('aria-selected', 'true');
    await expect(win).toContainText('Weekly fleet health check');
    await expect(win.getByRole('form', { name: 'New shared task' })).toBeVisible();
    await win.getByRole('tab', { name: 'Council' }).click();
    await expect(page.getByRole('dialog', { name: 'Conference Room — Council room' })).toContainText('Q4 pricing review');
  });

  test('people in a meeting are drawn in the Conference Room', async ({ page }) => {
    await noServer(page);
    await page.goto('/?demo=1');
    const seat = await page.locator('[data-person="michael"]').evaluate((el) => el.closest('[data-seat]')?.getAttribute('data-seat'));
    expect(seat).toMatch(/^seat\.conf\./);
  });

  test('keyboard: Tab to a person and press Enter to open their window', async ({ page }) => {
    await noServer(page);
    await page.goto('/?demo=1');
    await person(page, /^Pam Beesly — /).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Pam Beesly' })).toBeVisible();
  });
});

test.describe('data sources', () => {
  test('demo mode works with no server, including a local chat echo', async ({ page }) => {
    await noServer(page);
    await page.goto('/');
    await expect(page.getByTestId('source')).toHaveText('Demo');
    await expect(page.locator('[data-person]')).toHaveCount(23);
    await person(page, 'Dwight Schrute — campaigns — working').click();
    const win = page.getByRole('dialog', { name: 'Dwight Schrute' });
    await win.getByLabel('Message Direct line').fill('How are the Q4 numbers?');
    await win.getByRole('button', { name: 'Send' }).click();
    await expect(win.locator('.msg.mine')).toContainText('How are the Q4 numbers?');
    await expect(win.locator('.msg:not(.mine)')).toContainText('Dwight here');
  });

  test('an SSE update changes a status on the map', async ({ page }) => {
    await liveServer(page, [{ presence: { dwight: { status: 'error', activity: 'Ad account locked' } } }]);
    await page.goto('/');
    await expect(page.getByTestId('source')).toHaveText('Live');
    await expect(person(page, 'Dwight Schrute — campaigns — error')).toBeVisible();
    await expect(page.locator('[data-person="dwight"]')).toHaveAttribute('data-status', 'error');
  });

  test('an SSE update that moves a bot into a room walks them to the Conference Room', async ({ page }) => {
    await liveServer(page, [{ presence: { kelly: { status: 'meeting', roomId: 'ops', activity: 'Fleet review' } } }]);
    await page.goto('/');
    await expect(person(page, 'Kelly Kapoor — social — in a meeting')).toBeVisible();
    const seat = await page.locator('[data-person="kelly"]').evaluate((el) => el.closest('[data-seat]')?.getAttribute('data-seat'));
    expect(seat).toMatch(/^seat\.conf\./);
  });
});
