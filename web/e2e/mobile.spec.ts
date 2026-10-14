import { expect, test } from '@playwright/test';
import { noServer } from './helpers';

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });

test.beforeEach(async ({ page }) => {
  await noServer(page);
  await page.goto('/?demo=1');
});

test.describe('phone width', () => {
  test('shows a list grouped by room instead of the map, with no sideways scrolling', async ({ page }) => {
    await expect(page.locator('.office-map')).toHaveCount(0);
    const headings = page.locator('.list-view h2');
    await expect(headings.first()).toHaveText('Reception');
    await expect(headings.nth(1)).toHaveText('Bullpen');
    await expect(page.locator('.list-row')).toHaveCount(23);
    const reception = page.getByRole('region', { name: 'Reception' });
    await expect(reception.locator('.list-row').first()).toContainText('Sadiq');
    await expect(reception.locator('.list-row').first()).toContainText('Gateway timeout');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });

  test('tapping someone opens their window as a full-screen sheet', async ({ page }) => {
    await page.getByRole('button', { name: /^Dwight Schrute — campaigns — working/ }).tap();
    const win = page.getByRole('dialog', { name: 'Dwight Schrute' });
    await expect(win).toBeVisible();
    const box = (await win.boundingBox())!;
    expect(box.x).toBe(0);
    expect(box.width).toBe(390);
    await win.getByRole('button', { name: 'Close Dwight Schrute' }).tap();
    await expect(win).toBeHidden();
  });

  test('room chips open the room; filter chips narrow the list', async ({ page }) => {
    await page.getByRole('region', { name: 'Conference Room' }).getByRole('button', { name: 'Council room' }).tap();
    await expect(page.getByRole('dialog', { name: 'Conference Room — Council room' })).toBeVisible();
    await page.getByRole('button', { name: 'Close Conference Room — Council room' }).tap();
    await page.getByRole('button', { name: /^Errors/ }).tap();
    await expect(page.locator('.list-row')).toHaveCount(1);
    await expect(page.locator('.list-row')).toContainText('Sadiq');
    await page.getByRole('button', { name: /^Everyone/ }).tap();
    await expect(page.locator('.list-row')).toHaveCount(23);
  });

  test('the map is one tap away', async ({ page }) => {
    await page.getByRole('button', { name: 'Show the map' }).tap();
    await expect(page.locator('.office-map')).toBeVisible();
    await expect(page.locator('[data-person]')).toHaveCount(23);
    await page.getByRole('button', { name: 'Show the list' }).tap();
    await expect(page.locator('.list-row')).toHaveCount(23);
  });
});

test.describe('wide screens', () => {
  test.use({ viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false });
  test('can switch to the list view too', async ({ page }) => {
    await expect(page.locator('.office-map')).toBeVisible();
    await page.getByRole('button', { name: 'Show the list' }).click();
    await expect(page.locator('.list-row')).toHaveCount(23);
  });
});
