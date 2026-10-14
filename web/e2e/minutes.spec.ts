import { expect, test, type Page } from '@playwright/test';
import type { MeetingsView } from '../../shared/contract';
import { liveServer, noServer } from './helpers';

const conference = (page: Page) => page.getByRole('dialog', { name: /^Conference Room — / });

async function openMinutes(page: Page) {
  await page.getByRole('button', { name: /^Conference Room — / }).click();
  await conference(page).getByRole('tab', { name: 'Minutes' }).click();
  await expect(page.getByRole('dialog', { name: 'Conference Room — Minutes' })).toBeVisible();
}

test.describe('Conference Room minutes (demo)', () => {
  test.use({ timezoneId: 'America/New_York' });
  test.beforeEach(async ({ page }) => {
    await noServer(page);
    await page.goto('/?demo=1');
    await expect(page.locator('[data-person]')).toHaveCount(23);
  });

  test('the Minutes tab lists each meeting with its state, and filters Council sessions', async ({ page }) => {
    await openMinutes(page);
    const list = conference(page).getByRole('list', { name: 'Meetings' });
    await expect(list.getByRole('button')).toHaveCount(5);
    await expect(list.getByRole('button', { name: /^Council 2026-10-13, In session/ })).toBeVisible();
    await expect(list.getByRole('button', { name: /^Weekly fleet health check, Blocked/ })).toBeVisible();
    await expect(list.getByRole('button', { name: /^Council 2026-10-09, Adjourned/ })).toContainText('48 min');
    await conference(page).getByRole('button', { name: 'Council', exact: true }).click();
    await expect(list.getByRole('button')).toHaveCount(2);
    await conference(page).getByRole('tab', { name: 'Ops' }).click();
    await expect(page.getByRole('dialog', { name: 'Conference Room — Ops room' })).toContainText('Shared tasks');
  });

  test('a meeting opens as a printable memo built from the record', async ({ page }) => {
    await openMinutes(page);
    await conference(page).getByRole('button', { name: /^Council 2026-10-09/ }).click();
    const memo = conference(page).getByTestId('memo');
    await expect(memo).toContainText('Memorandum');
    await expect(memo).toContainText('Minutes: Council 2026-10-09');
    await expect(memo).toContainText('Pam Beesly (chair), Michael Scott, Angela Martin, David Wallace, Ryan Howard');
    await expect(memo).toContainText('Called to order 10:00 AM, adjourned 10:48 AM (48 min).');
    await expect(memo.getByRole('listitem').filter({ hasText: 'Dundies budget: round 1 finance (Angela Martin)' })).toBeVisible();
    await expect(memo).toContainText('Angela Martin: “Ryan, no.”');
    await expect(memo).toContainText('No AI wrote these minutes.');
    await expect(conference(page).getByRole('button', { name: 'Print' })).toBeVisible();
    await conference(page).getByRole('button', { name: '← All minutes' }).click();
    await expect(conference(page).getByRole('list', { name: 'Meetings' })).toBeVisible();
  });

  test('Ask Pam opens the minutes', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByRole('combobox', { name: 'Ask Pam' }).fill('minutes');
    await expect(page.getByRole('option').first()).toContainText('Read the Conference Room minutes');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Conference Room — Minutes' })).toBeVisible();
  });
});

test.describe('Conference Room minutes (live server)', () => {
  test.use({ timezoneId: 'America/New_York' });
  const view: MeetingsView = {
    from: '2026-10-06T15:00:00.000Z', to: '2026-10-14T15:00:00.000Z', generatedAt: '2026-10-13T15:00:00.000Z',
    meetings: [{
      id: 'hermes-task-t_ops', kind: 'shared-task', title: 'Order toner for the copier', roomId: 'ops', status: 'adjourned',
      startedAt: '2026-10-12T14:00:00.000Z', endedAt: '2026-10-12T14:25:00.000Z', participantIds: ['sadiq', 'dwight'],
      agenda: [{ taskId: 't_ops', title: 'Order toner for the copier', ownerId: 'sadiq', status: 'done' }],
      lines: [
        { at: '2026-10-12T13:55:00.000Z', kind: 'opened', author: 'You', text: 'Card opened' },
        { at: '2026-10-12T14:00:00.000Z', kind: 'started', personId: 'sadiq', text: 'Picked it up' },
        { at: '2026-10-12T14:20:00.000Z', kind: 'comment', personId: 'dwight', text: 'Get the good toner.' },
        { at: '2026-10-12T14:25:00.000Z', kind: 'result', personId: 'sadiq', text: 'Ordered 4 cartridges.' },
        { at: '2026-10-12T14:25:00.000Z', kind: 'closed', text: 'Adjourned' },
      ],
    }],
  };

  test('reads GET /api/meetings for the last 7 days and shows the memo', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-10-13T15:00:00Z'));
    await liveServer(page);
    const asked: string[] = [];
    await page.route('**/api/meetings?**', (route) => {
      asked.push(new URL(route.request().url()).search);
      return route.fulfill({ json: view });
    });
    await page.goto('/');
    await openMinutes(page);
    expect(asked[0]).toBe('?from=2026-10-06T15%3A00%3A00.000Z&to=2026-10-14T15%3A00%3A00.000Z');
    await conference(page).getByRole('button', { name: /^Order toner for the copier, Adjourned/ }).click();
    const memo = conference(page).getByTestId('memo');
    await expect(memo).toContainText('Sadiq (owner), Dwight Schrute');
    await expect(memo).toContainText('Dwight Schrute: “Get the good toner.”');
    await expect(memo).toContainText('Ordered 4 cartridges.');
  });
});
