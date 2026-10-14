import { expect, test } from '@playwright/test';
import { DEMO_SNAPSHOT } from '../../shared/fixtures/demo-snapshot';
import { liveServer, person } from './helpers';

const WRITABLE = { ...DEMO_SNAPSHOT, capabilities: { writes: true } };
const READ_ONLY = { ...DEMO_SNAPSHOT, capabilities: { writes: false } };

test.describe('live mode against the server contract', () => {
  test('chat shows typing… while the bot thinks, then the reply; 429 means busy', async ({ page }) => {
    await liveServer(page, [], WRITABLE);
    let calls = 0;
    await page.route('**/api/chat', async (route) => {
      calls += 1;
      const body = route.request().postDataJSON() as { roomId: string; text: string };
      expect(body.roomId).toBe('dm-campaigns');
      if (calls === 1) {
        await new Promise((r) => setTimeout(r, 700));
        await route.fulfill({ json: [{ id: 'r1', roomId: body.roomId, authorId: 'dwight', text: 'Report is 80% done.', at: new Date().toISOString() }] });
      } else {
        await route.fulfill({ status: 429, json: { error: 'busy' } });
      }
    });
    await page.goto('/');
    await person(page, /^Dwight Schrute — /).click();
    const win = page.getByRole('dialog', { name: 'Dwight Schrute' });
    await expect(win).toContainText('No messages in this room yet.');
    await win.getByLabel('Message Direct line').fill('Where is the Q4 report?');
    await win.getByRole('button', { name: 'Send' }).click();
    await expect(win.getByLabel('Dwight is typing')).toBeVisible();
    await expect(win.locator('.msg:not(.mine)')).toContainText('Report is 80% done.');
    await win.getByLabel('Message Direct line').fill('And now?');
    await win.getByRole('button', { name: 'Send' }).click();
    await expect(win.getByRole('alert')).toContainText('Dwight is busy');
  });

  test('the Ops room creates a shared task for a chosen bot', async ({ page }) => {
    await liveServer(page, [], WRITABLE);
    await page.route('**/api/tasks', async (route) => {
      const body = route.request().postDataJSON() as { roomId: string; title: string; assignee: string };
      expect(body).toEqual({ roomId: 'ops', title: 'Audit the ad spend', assignee: 'campaigns' });
      await route.fulfill({ status: 201, json: { id: 't-new', title: body.title, status: 'todo', ownerId: 'dwight', roomId: 'ops', shared: true, updatedAt: new Date().toISOString() } });
    });
    await page.goto('/');
    await page.getByRole('button', { name: /^Conference Room — / }).click();
    const win = page.getByRole('dialog', { name: 'Conference Room — Ops room' });
    await win.getByLabel('Task title').fill('Audit the ad spend');
    await win.getByLabel('Assignee').selectOption('campaigns');
    await win.getByRole('button', { name: 'Create' }).click();
    await expect(win.locator('.task-list')).toContainText('Audit the ad spend');
  });

  test('a read-only server (the default) swaps chat and new tasks for a hint', async ({ page }) => {
    await liveServer(page, [], READ_ONLY);
    let posts = 0;
    await page.route('**/api/{chat,tasks}', (route) => { posts += 1; return route.abort(); });
    await page.goto('/');
    await expect(page.getByTestId('source')).toHaveText('Live');
    await expect(page.getByTestId('read-only')).toBeVisible();

    await person(page, /^Dwight Schrute — /).click();
    const dwight = page.getByRole('dialog', { name: 'Dwight Schrute' });
    await expect(dwight).toContainText('No messages in this room yet.');
    await expect(dwight.getByRole('note')).toContainText('DMOS_ALLOW_WRITES=1');
    await expect(dwight.getByLabel('Message Direct line')).toHaveCount(0);

    await page.getByRole('button', { name: /^Conference Room — / }).click();
    const ops = page.getByRole('dialog', { name: 'Conference Room — Ops room' });
    await expect(ops.getByRole('form', { name: 'New shared task' })).toHaveCount(0);
    await expect(ops.getByRole('note').first()).toContainText('creating shared tasks is off');
    expect(posts).toBe(0);
  });

  test('a server that wants a sign-in sends the browser to /login', async ({ page }) => {
    await page.route('**/api/office', (route) => route.fulfill({ status: 401, json: { error: 'Sign in required' } }));
    await page.route('**/login?**', (route) => route.fulfill({ contentType: 'text/html', body: '<title>Sign in</title><h1>Sign in</h1>' }));
    await page.goto('/?x=1');
    await expect(page).toHaveURL(/\/login\?next=%2F%3Fx%3D1$/);
    await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  });
});
