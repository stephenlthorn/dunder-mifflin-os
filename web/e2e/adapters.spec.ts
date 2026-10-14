import { expect, test } from '@playwright/test';
import type { OfficeSnapshot } from '../../shared/contract';
import { DEMO_SNAPSHOT } from '../../shared/fixtures/demo-snapshot';
import { liveServer, person } from './helpers';

const READ_ONLY = { chat: false, createTask: false, approvals: false, pause: false, stop: false };

/** The demo office plus a webhook agent that has no character of its own: a temp at a spare desk who needs you. */
const WITH_TEMP: OfficeSnapshot = {
  ...DEMO_SNAPSHOT,
  capabilities: { writes: true }, // the server allows writes; the webhook adapter still can't take any
  people: [...DEMO_SNAPSHOT.people, {
    id: 'temp-webhook-deploy-bot', name: 'Deploy Bot', title: 'Temp · Webhook', seatId: 'seat.spare.1',
    bot: { profile: 'deploy-bot', role: 'Ships releases', adapter: 'webhook', capabilities: READ_ONLY },
    look: { skin: '#e8c4a0', hair: '#3a2a1e', hairStyle: 'short', shirt: '#7d8fa6', tie: '#33415c' },
  }],
  presence: { ...DEMO_SNAPSHOT.presence, 'temp-webhook-deploy-bot': { status: 'needs-input', activity: 'Approve the production deploy?' } },
  rooms: [...DEMO_SNAPSHOT.rooms, {
    id: 'webhook-deploy-bot', name: 'Direct line: Deploy Bot', areaId: 'bullpen', kind: 'dm', memberIds: ['temp-webhook-deploy-bot'],
    adapter: 'webhook', capabilities: READ_ONLY,
  }],
};

test.describe('agents from other adapters', () => {
  test('a webhook agent sits at a spare desk, shows that it needs you, and its direct line is read-only', async ({ page }) => {
    await liveServer(page, [], WITH_TEMP);
    await page.goto('/');
    const temp = person(page, 'Deploy Bot — deploy-bot — needs you');
    await expect(temp).toBeVisible();
    await temp.click();
    const win = page.getByRole('dialog', { name: 'Deploy Bot' });
    await expect(win).toContainText('Temp · Webhook');
    await expect(win).toContainText('Approve the production deploy?');
    await expect(win).toContainText('read-only');
    await expect(win.getByRole('button', { name: 'Send' })).toHaveCount(0);
  });

  test('a Hermes bot keeps its composer', async ({ page }) => {
    await liveServer(page, [], WITH_TEMP);
    await page.goto('/');
    await person(page, /^Dwight Schrute — /).click();
    await expect(page.getByRole('dialog', { name: 'Dwight Schrute' }).getByRole('button', { name: 'Send' })).toBeVisible();
  });

  test('on a read-only server nobody gets a composer, and the hint says how to turn writes on', async ({ page }) => {
    await liveServer(page, [], { ...WITH_TEMP, capabilities: { writes: false } });
    await page.goto('/');
    await person(page, /^Dwight Schrute — /).click();
    const win = page.getByRole('dialog', { name: 'Dwight Schrute' });
    await expect(win).toContainText('DMOS_ALLOW_WRITES=1');
    await expect(win.getByRole('button', { name: 'Send' })).toHaveCount(0);
  });
});
