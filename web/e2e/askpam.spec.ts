import { expect, test, type Page } from '@playwright/test';
import { DEMO_SNAPSHOT } from '../../shared/fixtures/demo-snapshot';
import { liveServer, noServer } from './helpers';

const palette = (page: Page) => page.getByRole('dialog', { name: 'Ask Pam' });
const combo = (page: Page) => page.getByRole('combobox', { name: 'Ask Pam' });
const openPalette = async (page: Page) => {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(combo(page)).toBeFocused();
};
const mapScale = (page: Page) => page.locator('svg.office-map > g[transform]').getAttribute('transform')
  .then((t) => Number(/scale\(([\d.]+)\)/.exec(t ?? '')?.[1] ?? Number.NaN));

test.describe('Ask Pam (⌘K / Ctrl+K)', () => {
  test.beforeEach(async ({ page }) => {
    await noServer(page);
    await page.goto('/?demo=1');
    await expect(page.locator('[data-person]')).toHaveCount(23);
  });

  test('is an ARIA combobox: type, the first match is active, Enter opens it, recents remember it', async ({ page }) => {
    await openPalette(page);
    await expect(palette(page)).toBeVisible();
    await expect(combo(page)).toHaveAttribute('aria-expanded', 'true');
    await expect(combo(page)).toHaveAttribute('placeholder', 'Dunder Mifflin, this is Pam…');
    await combo(page).fill('dwi');
    const first = page.getByRole('option').first();
    await expect(first).toContainText('Dwight Schrute');
    await expect(first).toHaveAttribute('aria-selected', 'true');
    await expect(combo(page)).toHaveAttribute('aria-activedescendant', (await first.getAttribute('id'))!);
    await page.keyboard.press('Enter');
    await expect(palette(page)).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'Dwight Schrute' })).toBeVisible();
    await openPalette(page);
    await expect(page.getByRole('group', { name: 'Recent' }).getByRole('option').first()).toContainText('Dwight Schrute');
  });

  test('arrow keys move the active option, and Esc closes and gives focus back', async ({ page }) => {
    const zoomIn = page.getByRole('button', { name: 'Zoom in' });
    await zoomIn.focus();
    await openPalette(page);
    await combo(page).fill('kelly');
    const options = page.getByRole('option');
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(options.nth(1)).toContainText('Chat with Kelly');
    await page.keyboard.press('ArrowUp');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Tab'); // focus stays in the palette
    await expect(combo(page)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(palette(page)).toBeHidden();
    await expect(zoomIn).toBeFocused();
  });

  test('Shift+Enter glides the camera to the person and focuses them on the map', async ({ page }) => {
    const before = await mapScale(page);
    await openPalette(page);
    await combo(page).fill('kelly');
    await page.keyboard.press('Shift+Enter');
    await expect(palette(page)).toBeHidden();
    await expect(page.locator('[data-person="kelly"]')).toBeFocused();
    await expect(page.getByRole('tooltip')).toContainText('Kelly Kapoor');
    expect(await mapScale(page)).toBeGreaterThan(before * 1.5);
    const box = (await page.locator('[data-person="kelly"]').boundingBox())!;
    expect(Math.abs(box.x + box.width / 2 - 720)).toBeLessThan(80);
  });

  test('starting a chat with a bot opens their window with the composer focused', async ({ page }) => {
    await openPalette(page);
    await combo(page).fill('chat jarvis');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Jarvis' })).toBeVisible();
    await expect(page.getByLabel('Message Direct line')).toBeFocused();
  });

  test('opens the Conference Room and toggles fleet filters', async ({ page }) => {
    await openPalette(page);
    await expect(page.getByRole('group', { name: 'Ask Pam to…' })).toContainText('Open the Conference Room');
    await page.getByRole('option', { name: /Open the Conference Room/ }).click();
    await expect(page.getByRole('dialog', { name: 'Conference Room — Ops room' })).toBeVisible();

    await openPalette(page);
    await combo(page).fill('only errors');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'Showing only bots with errors' })).toBeVisible();
    await expect(page.locator('.seat.is-dimmed [data-person="dwight"]')).toHaveCount(1);
    await expect(page.locator('.seat.is-dimmed [data-person="sadiq"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'Show everyone' }).click();
    await expect(page.locator('.seat.is-dimmed')).toHaveCount(0);
  });

  test('filters by status with s: and says so when nothing matches', async ({ page }) => {
    await openPalette(page);
    await combo(page).fill('s:error');
    await expect(page.getByRole('option')).toHaveCount(2);
    await expect(page.getByRole('option').first()).toContainText('Sadiq');
    await combo(page).fill('zzzz');
    await expect(page.getByRole('option')).toHaveCount(0);
    await expect(palette(page)).toContainText('Pam couldn’t find “zzzz”');
  });

  test('"/" opens it too, without typing the slash', async ({ page }) => {
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await page.keyboard.press('/');
    await expect(combo(page)).toBeFocused();
    await expect(combo(page)).toHaveValue('');
  });
});

test.describe('Ask Pam on a live server', () => {
  test('offers no "Chat with …" while the server is read-only', async ({ page }) => {
    await liveServer(page); // no capabilities in the snapshot: read-only
    await page.goto('/');
    await expect(page.getByTestId('read-only')).toBeVisible();
    await openPalette(page);
    await combo(page).fill('dwight');
    await expect(page.getByRole('option').first()).toContainText('Dwight Schrute');
    await expect(page.getByRole('option').filter({ hasText: 'Chat with' })).toHaveCount(0);
  });

  test('offers chats when the server allows writes', async ({ page }) => {
    await liveServer(page, [], { ...DEMO_SNAPSHOT, capabilities: { writes: true } });
    await page.goto('/');
    await openPalette(page);
    await combo(page).fill('chat dwight');
    await expect(page.getByRole('option').first()).toContainText('Chat with Dwight');
  });
});
