import { expect, test } from '@playwright/test';
import { noServer } from './helpers';

test.describe('settings', () => {
  test('the gear opens settings; choices persist across reloads', async ({ page }) => {
    await noServer(page);
    await page.goto('/?demo=1');
    const gear = page.getByRole('button', { name: 'Settings' });
    await gear.click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await expect(settings.getByRole('switch', { name: /Chime/ })).not.toBeChecked();
    await settings.getByRole('switch', { name: /Reduce motion/ }).check();
    await expect(page.locator('.os')).toHaveClass(/reduce-motion/);
    await page.reload();
    await expect(settings).toBeHidden();
    await expect(page.locator('.os')).toHaveClass(/reduce-motion/);
    await gear.click();
    await expect(settings.getByRole('switch', { name: /Reduce motion/ })).toBeChecked();
    await page.keyboard.press('Escape');
    await expect(settings).toBeHidden();
    await expect(gear).toBeFocused();
  });

  test('the palette hotkey and single-key shortcuts can be turned off', async ({ page }) => {
    await noServer(page);
    await page.goto('/?demo=1');
    await page.getByRole('button', { name: 'Settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('switch', { name: /opens Ask Pam/ }).uncheck();
    await settings.getByRole('switch', { name: /Single-key shortcuts/ }).uncheck();
    await page.keyboard.press('Escape');
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.press('?');
    await expect(page.getByRole('dialog', { name: 'Ask Pam' })).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeHidden();
    await page.getByRole('button', { name: /Ask Pam/ }).click(); // the top-bar button always works
    await expect(page.getByRole('dialog', { name: 'Ask Pam' })).toBeVisible();
  });

  test('blocked storage does not break the app', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('denied'); } });
    });
    await noServer(page);
    await page.goto('/?demo=1');
    await expect(page.locator('[data-person]')).toHaveCount(23);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('switch', { name: /Reduce motion/ }).check();
    await expect(page.locator('.os')).toHaveClass(/reduce-motion/);
  });
});
