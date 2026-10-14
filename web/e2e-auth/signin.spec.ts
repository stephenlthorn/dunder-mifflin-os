import { expect, test } from '@playwright/test';
import { E2E_TOKEN } from '../playwright.auth.config';

test('a token-protected office asks once, then loads read-only', async ({ page, context }) => {
  await page.goto('/?demo=0');
  await expect(page).toHaveURL(/\/login\?next=%2F%3Fdemo%3D0$/);
  await expect(page).toHaveTitle('Sign in · Dunder Mifflin OS');

  await page.getByLabel('Access token').fill('not-the-token-not-the-token');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toContainText('did not match');

  await page.getByLabel('Access token').fill(E2E_TOKEN);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/\?demo=0$/);
  await expect(page.getByTestId('source')).toHaveText('Live');
  await expect(page.getByTestId('read-only')).toBeVisible();
  await expect(page.locator('[data-person]')).toHaveCount(23);

  const session = (await context.cookies()).find((c) => c.name === 'dmos_session');
  expect(session).toMatchObject({ httpOnly: true, sameSite: 'Strict' });
  expect(session?.value).not.toContain(E2E_TOKEN);

  await page.goto('/login');
  await expect(page).toHaveURL(/\/$/); // already signed in: straight back to the office
});

test('API calls without the session cookie are refused', async ({ request }) => {
  const res = await request.get('/api/office');
  expect(res.status()).toBe(401);
  expect((await request.get('/api/health')).status()).toBe(200);
});
