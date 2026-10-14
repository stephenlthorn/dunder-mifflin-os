import { expect, test, type Page } from '@playwright/test';
import { DEMO_SNAPSHOT } from '../../shared/fixtures/demo-snapshot';
import { mapTargets, ROW_PX } from '../src/map/mapTargets';
import { placementsFor, signsFor } from '../src/map/mapModel';
import { flatOrder, readingRows } from '../src/map/readingOrder';
import { noServer } from './helpers';

const ORDER = flatOrder(readingRows(mapTargets(DEMO_SNAPSHOT, placementsFor(DEMO_SNAPSHOT), signsFor(DEMO_SNAPSHOT), new Set()), ROW_PX));

const focusedKey = (page: Page) => page.evaluate(() => {
  const el = document.activeElement;
  const person = el?.getAttribute('data-person');
  const area = el?.getAttribute('data-area-sign');
  return person ? `person:${person}` : area ? `area:${area}` : `other:${el?.getAttribute('aria-label') ?? el?.tagName}`;
});

test.beforeEach(async ({ page }) => {
  await noServer(page);
  await page.goto('/?demo=1');
  await expect(page.locator('[data-person]')).toHaveCount(23);
});

test.describe('keyboard navigation of the map', () => {
  test('Tab walks people and rooms in reading order, then on to the zoom controls', async ({ page }) => {
    expect(ORDER).toHaveLength(30); // 23 people, 6 room signs, Angela's ledger
    await page.getByRole('button', { name: 'Settings' }).focus();
    const seen: string[] = [];
    for (let i = 0; i < 40 && seen.length <= ORDER.length; i += 1) {
      await page.keyboard.press('Tab');
      const key = await focusedKey(page);
      if (key.startsWith('person:') || key.startsWith('area:')) seen.push(key);
      else if (seen.length) break;
    }
    expect(seen).toEqual(ORDER);
    expect(await focusedKey(page)).toBe('other:Zoom in');
    await page.keyboard.press('Shift+Tab');
    expect(await focusedKey(page)).toBe(ORDER[ORDER.length - 1]);
  });

  test('arrow keys, Home and End move between targets; Enter opens', async ({ page }) => {
    const pam = ORDER.indexOf('person:pam');
    await page.locator('[data-person="pam"]').focus();
    await page.keyboard.press('ArrowRight');
    expect(await focusedKey(page)).toBe(ORDER[pam + 1]);
    await page.keyboard.press('ArrowLeft');
    expect(await focusedKey(page)).toBe('person:pam');
    await page.keyboard.press('ArrowDown');
    expect(await focusedKey(page)).not.toBe('person:pam');
    await page.keyboard.press('Home');
    expect(await focusedKey(page)).toBe(ORDER[0]);
    await page.keyboard.press('End');
    expect(await focusedKey(page)).toBe(ORDER[ORDER.length - 1]);
    await page.locator('[data-area-sign="conference"]').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Conference Room — Ops room' })).toBeVisible();
  });

  test('"?" shows the shortcuts sheet and Esc closes it', async ({ page }) => {
    await page.locator('[data-person="pam"]').focus();
    await page.keyboard.press('?');
    const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
    await expect(sheet).toBeVisible();
    await expect(sheet).toContainText('Ask Pam');
    await expect(sheet).toContainText('Show on the map');
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(page.locator('[data-person="pam"]')).toBeFocused();
  });
});
