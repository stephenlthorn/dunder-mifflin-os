// The documentary crew (a bot's Timeline tab) and Angela's ledger, in demo mode and against a mocked live API.
import { expect, test, type Page } from '@playwright/test';
import type { TimelineResponse, UsageReport } from '../../shared/observability';
import { DEMO_SNAPSHOT } from '../../shared/fixtures/demo-snapshot';
import { demoUsage } from '../src/observability/demoObservability';
import { liveServer, noServer, person } from './helpers';

const WITH_CLAUDE_CODE: UsageReport = (() => {
  const r = demoUsage(DEMO_SNAPSHOT, '7d');
  return {
    ...r, rows: [...r.rows, { personId: 'temp-claude-code-paper-site', name: 'paper-site', adapterId: 'claude-code', adapterLabel: 'Claude Code', usage: null, unavailable: 'No usage data from Claude Code' }],
  };
})();

const LIVE_TIMELINE: TimelineResponse = {
  personId: 'pam', available: true, adapter: { id: 'hermes', label: 'Hermes' }, since: new Date(Date.now() - 86_400_000).toISOString(), truncated: false,
  events: [
    { id: 'a', at: new Date(Date.now() - 5 * 60_000).toISOString(), kind: 'message.out', title: 'Handoff sent to Dwight.', source: 'telegram' },
    { id: 'b', at: new Date(Date.now() - 50 * 60_000).toISOString(), kind: 'cron.ok', title: 'Morning handoff digest', detail: 'delivered', source: 'cron' },
  ],
};

async function mockObservability(page: Page) {
  await page.route('**/api/usage*', (route) => route.fulfill({ json: WITH_CLAUDE_CODE }));
  await page.route('**/api/people/*/timeline*', (route) => route.fulfill({ json: LIVE_TIMELINE }));
}

test.describe('the documentary crew: a bot\'s timeline', () => {
  test('Dwight\'s Timeline tab sums up his day and lists what happened, with filters', async ({ page }) => {
    await noServer(page);
    await page.goto('/?demo=1');
    await person(page, /^Dwight Schrute — /).click();
    const win = page.getByRole('dialog', { name: 'Dwight Schrute' });
    await win.getByRole('tab', { name: 'Timeline' }).click();
    await expect(win.getByTestId('talking-head')).toContainText(/^Today Dwight ran Lead digest 3 times and Weekly campaign report once \(1 failed at \d\d:\d\d\)/);
    const list = win.getByRole('list', { name: "Dwight's timeline" });
    await expect(list.locator('li')).toHaveCount(11);
    await win.getByRole('button', { name: 'Errors' }).click();
    await expect(list.locator('li')).toHaveCount(2);
    await expect(list.locator('li').first()).toContainText('Weekly campaign report');
    await expect(list.locator('li').first()).toContainText(/min ago|h ago/);
  });

  test('the tab sticks when the window is opened again, and people without a bot have no tabs', async ({ page }) => {
    await noServer(page);
    await page.goto('/?demo=1');
    await person(page, /^Dwight Schrute — /).click();
    const win = page.getByRole('dialog', { name: 'Dwight Schrute' });
    await win.getByRole('tab', { name: 'Timeline' }).click();
    await person(page, /^Dwight Schrute — /).click();
    await expect(win.getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
    await person(page, /^Jim Halpert — /).click();
    await expect(page.getByRole('dialog', { name: 'Jim Halpert' }).getByRole('tab')).toHaveCount(0);
  });

  test('live: the timeline comes from the server', async ({ page }) => {
    await liveServer(page);
    await mockObservability(page);
    await page.goto('/');
    await person(page, /^Pam Beesly — /).click();
    const win = page.getByRole('dialog', { name: 'Pam Beesly' });
    await win.getByRole('tab', { name: 'Timeline' }).click();
    await expect(win.getByTestId('talking-head')).toContainText('Today Pam ran Morning handoff digest once');
    await expect(win.getByRole('list', { name: "Pam's timeline" })).toContainText('Handoff sent to Dwight.');
  });
});

test.describe('Angela\'s ledger', () => {
  test('the accounting sign opens it: bots by estimated cost, bars to scale, the unpriced one says so', async ({ page }) => {
    await noServer(page);
    await page.goto('/?demo=1');
    await page.getByRole('button', { name: /^Angela’s ledger/ }).click();
    const win = page.getByRole('dialog', { name: 'Angela’s ledger' });
    await expect(win.getByRole('tab', { name: 'Today' })).toHaveAttribute('aria-selected', 'true');
    await win.getByRole('tab', { name: '30 days' }).click();
    const rows = win.locator('[data-person-row]');
    await expect(rows).toHaveCount(12);
    await expect(rows.first()).toHaveAttribute('data-person-row', 'pam'); // Opus at list prices outspends the rest
    await expect(win.locator('[data-person-row="sadiq"]')).toContainText('No price for MiniMax-M3.1-Flash-Preview');
    await expect(win.getByTestId('ledger-total')).toContainText(/Total \$[\d,.]+/);
    await win.getByRole('button', { name: 'Tokens' }).click();
    await expect(rows.first()).toHaveAttribute('data-person-row', 'sadiq');
  });

  test('live: an adapter without usage shows "No usage data", not zeros; a name opens that bot\'s timeline', async ({ page }) => {
    await liveServer(page);
    await mockObservability(page);
    await page.goto('/');
    await page.getByRole('button', { name: /^Angela’s ledger/ }).click();
    const win = page.getByRole('dialog', { name: 'Angela’s ledger' });
    const cc = win.locator('[data-person-row="temp-claude-code-paper-site"]');
    await expect(cc).toContainText('No usage data from Claude Code');
    await expect(cc).not.toContainText('$');
    await win.getByRole('button', { name: 'Pam Beesly: open their timeline' }).click();
    await expect(page.getByRole('dialog', { name: 'Pam Beesly' }).getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
  });

  test('Ask Pam opens the ledger and any bot\'s timeline; Angela\'s window links to it', async ({ page }) => {
    await noServer(page);
    await page.goto('/?demo=1');
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.type('ledger');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Angela’s ledger' })).toBeVisible();
    await page.keyboard.press('ControlOrMeta+k');
    await page.keyboard.type('timeline kelly');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Kelly Kapoor' }).getByRole('tab', { name: 'Timeline' })).toHaveAttribute('aria-selected', 'true');
    await person(page, /^Angela Martin — /).focus(); // she is in a Council meeting, behind the others
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Angela Martin' }).getByRole('button', { name: /Open Angela’s ledger/ })).toBeVisible();
  });
});
