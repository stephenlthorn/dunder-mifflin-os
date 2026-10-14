import { expect, test } from '@playwright/test';
import { fakeState, installFakes, liveWithFeed, setAway } from './fakes';

const dwightErrors = { presence: { dwight: { status: 'error', activity: 'Ad account locked' }, kelly: { status: 'idle' } } };
const favicon = (page: import('@playwright/test').Page) => page.locator('link[rel="icon"]').getAttribute('href');

test.describe('notifications', () => {
  test('a bot that errors while you are away badges the tab; coming back shows what changed', async ({ page }) => {
    await installFakes(page);
    const feed = await liveWithFeed(page);
    await page.goto('/');
    await expect(page.getByTestId('source')).toHaveText('Live');
    await expect(page).toHaveTitle('Dunder Mifflin OS');
    expect(await favicon(page)).not.toContain('circle');

    await setAway(page, true);
    feed.push([dwightErrors]);
    await expect(page).toHaveTitle('(1) Dunder Mifflin OS');
    expect(await favicon(page)).toContain('circle');
    expect(await fakeState(page)).toEqual({ notes: [], permAsked: 0, tones: 0 }); // both opt-in, never asked on load

    await setAway(page, false);
    const away = page.getByRole('region', { name: 'While you were away' });
    await expect(away).toContainText('Dwight hit an error: Ad account locked');
    await expect(away).toContainText('Kelly finished and is idle');
    await expect(page).toHaveTitle('Dunder Mifflin OS');
    expect(await favicon(page)).not.toContain('circle');
    await away.getByRole('button', { name: 'Dwight hit an error: Ad account locked' }).click();
    await expect(page.getByRole('dialog', { name: 'Dwight Schrute' })).toBeVisible();
    await away.getByRole('button', { name: 'Dismiss' }).click();
    await expect(away).toBeHidden();
  });

  test('a bot that starts needing you (needs-input) counts too', async ({ page }) => {
    await installFakes(page);
    const feed = await liveWithFeed(page);
    await page.goto('/');
    await expect(page.getByTestId('source')).toHaveText('Live');
    await setAway(page, true);
    feed.push([{ presence: { pam: { status: 'needs-input', activity: 'Approve the Council agenda?' } } }]);
    await expect(page).toHaveTitle('(1) Dunder Mifflin OS');
    await setAway(page, false);
    await expect(page.getByRole('region', { name: 'While you were away' })).toContainText('Pam needs you: Approve the Council agenda?');
  });

  test('browser notifications and the chime are switched on from Settings, and only then', async ({ page }) => {
    await installFakes(page);
    const feed = await liveWithFeed(page);
    await page.goto('/');
    await expect(page.getByTestId('source')).toHaveText('Live');
    await page.getByRole('button', { name: 'Settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('switch', { name: /Browser notifications/ }).check();
    await expect(settings.getByRole('switch', { name: /Browser notifications/ })).toBeChecked();
    await expect(settings).toContainText('Allowed');
    await settings.getByRole('switch', { name: /Chime/ }).check();
    const afterPreview = (await fakeState(page)).tones;
    expect(afterPreview).toBeGreaterThan(0); // a preview, so you know what it sounds like
    expect((await fakeState(page)).permAsked).toBe(1);

    await setAway(page, true);
    feed.push([dwightErrors]);
    await expect(page).toHaveTitle('(1) Dunder Mifflin OS');
    const state = await fakeState(page);
    expect(state.notes).toEqual([{ title: 'Dwight hit an error', body: 'Ad account locked' }]);
    expect(state.tones).toBeGreaterThan(afterPreview);
  });

  test('a blocked permission leaves notifications off and says why', async ({ page }) => {
    await installFakes(page, { answer: 'denied' });
    await liveWithFeed(page);
    await page.goto('/');
    await page.getByRole('button', { name: 'Settings' }).click();
    const settings = page.getByRole('dialog', { name: 'Settings' });
    await settings.getByRole('switch', { name: /Browser notifications/ }).click();
    await expect(settings).toContainText('Blocked by the browser');
    await expect(settings.getByRole('switch', { name: /Browser notifications/ })).not.toBeChecked();
  });
});
