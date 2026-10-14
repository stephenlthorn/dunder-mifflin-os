import { expect, test, type Page } from '@playwright/test';
import type { ScheduledJob } from '../../shared/contract';
import { buildScheduleView } from '../../shared/schedule/view';
import { liveServer, noServer } from './helpers';

// The demo office is a Tuesday, 2026-10-13, 11:00 in Scranton; its jobs run on New York time.
const calendar = (page: Page) => page.getByRole('dialog', { name: 'Party Planning Committee' });
const topBarButton = (page: Page) => page.getByRole('button', { name: 'Party Planning Committee calendar', exact: true });
const run = (page: Page, name: RegExp) => calendar(page).getByRole('button', { name });

test.describe('Party Planning Committee calendar (demo, New York)', () => {
  test.use({ timezoneId: 'America/New_York' });
  test.beforeEach(async ({ page }) => {
    await noServer(page);
    await page.goto('/?demo=1');
    await expect(page.locator('[data-person]')).toHaveCount(23);
  });

  test('opens from the top bar; the week view shows every bot’s jobs, coloured by bot, with how each run went', async ({ page }) => {
    await topBarButton(page).click();
    const win = calendar(page);
    await expect(win.getByRole('heading', { name: 'Oct 12 – 18, 2026' })).toBeVisible();
    await expect(win.locator('section.cal-day')).toHaveCount(7);
    await expect(run(page, /^Morning handoff digest, Pam Beesly, 8:00 AM/)).toHaveCount(5); // weekdays
    await expect(run(page, /^Trend scan, Ryan Howard, 6:00 AM, failed/)).toHaveCount(1);
    await expect(run(page, /^Skool member digest, Andy Bernard, 7:00 AM, didn’t run/)).toHaveCount(1);
    await expect(run(page, /^Morning handoff digest, Pam Beesly, 8:00 AM, ran OK/)).toHaveCount(1); // today's run
    await expect(run(page, /^Fleet health check, Sadiq: 24 runs this day/)).toHaveCount(7); // hourly: one summary per day
    await expect(win.getByTestId('cal-next')).toContainText('Post queue check');
    await expect(win.locator('.cal-chip.is-next')).toHaveCount(1);
    const color = (name: RegExp) => run(page, name).first().evaluate((el) => getComputedStyle(el).borderLeftColor);
    expect(await color(/^Morning handoff digest/)).not.toBe(await color(/^Lead follow-ups/));
    expect(await color(/^Morning handoff digest/)).toBe(await color(/^Council agenda/)); // both Pam's
  });

  test('clicking a run shows its job and opens the bot’s window', async ({ page }) => {
    await topBarButton(page).click();
    await run(page, /^Trend scan, Ryan Howard, 6:00 AM, failed/).click();
    const job = calendar(page).getByTestId('cal-job');
    await expect(job).toContainText('Trend scan');
    await expect(job).toContainText('cron 0 6 * * 1-5');
    await expect(job).toContainText('failed: offline');
    await expect(page.getByRole('dialog', { name: 'Ryan Howard' })).toBeVisible();
    await expect(run(page, /^Trend scan, Ryan Howard, 6:00 AM, failed/)).toHaveAttribute('aria-pressed', 'true');
  });

  test('opens from the break room: the pin on its bulletin board, and its room window', async ({ page }) => {
    await page.locator('[data-ppc-pin]').click();
    await expect(calendar(page)).toBeVisible();
    await page.getByRole('button', { name: 'Close Party Planning Committee' }).click();
    await page.getByRole('button', { name: /^Break Room — / }).click();
    await page.getByRole('dialog', { name: /^Break Room/ }).getByRole('button', { name: /Party Planning Committee calendar/ }).click();
    await expect(calendar(page)).toBeVisible();
  });

  test('day view, and moving between days and weeks', async ({ page }) => {
    await topBarButton(page).click();
    const win = calendar(page);
    await win.getByRole('button', { name: 'Day', exact: true }).click();
    await expect(win.getByRole('heading', { name: 'Tuesday, October 13, 2026' })).toBeVisible();
    await expect(run(page, /^Lunch macro reminder, Sensei Ira, 12:30 PM, scheduled/)).toContainText('12:30 PM');
    await win.getByRole('button', { name: 'Next day' }).click();
    await expect(win.getByRole('heading', { name: 'Wednesday, October 14, 2026' })).toBeVisible();
    await expect(run(page, /^Lesson plan review, Oscar Martinez, 1:00 PM/)).toBeVisible();
    await win.getByRole('button', { name: 'Week', exact: true }).click();
    await win.getByRole('button', { name: 'Previous week' }).click();
    await expect(win.getByRole('heading', { name: 'Oct 5 – 11, 2026' })).toBeVisible();
    await win.getByRole('button', { name: 'Today' }).click();
    await expect(win.getByRole('heading', { name: 'Oct 12 – 18, 2026' })).toBeVisible();
  });

  test('Ask Pam opens it', async ({ page }) => {
    await page.keyboard.press('ControlOrMeta+k');
    await page.getByRole('combobox', { name: 'Ask Pam' }).fill('party planning');
    await expect(page.getByRole('option').first()).toContainText('Open the Party Planning Committee calendar');
    await page.keyboard.press('Enter');
    await expect(calendar(page)).toBeVisible();
  });
});

test.describe('Party Planning Committee calendar (demo, Tokyo)', () => {
  test.use({ timezoneId: 'Asia/Tokyo' });
  test('shows Scranton jobs in the viewer’s own time', async ({ page }) => {
    await noServer(page);
    await page.goto('/?demo=1');
    await topBarButton(page).click();
    await expect(calendar(page)).toContainText('Times in your zone, Asia/Tokyo');
    await expect(run(page, /^Morning handoff digest, Pam Beesly, 9:00 PM/)).toHaveCount(5); // 8:00 AM in New York
  });
});

test.describe('Party Planning Committee calendar (live server)', () => {
  test.use({ timezoneId: 'America/New_York' });
  const NOW = new Date('2026-10-13T15:00:00Z');
  const jobs: Record<string, ScheduledJob[]> = {
    dwight: [{ name: 'Weekly campaign report', schedule: '0 16 * * 5', enabled: true, timeZone: 'America/New_York', lastRunAt: '2026-10-09T16:00:20-04:00', lastStatus: 'ok' }],
  };

  test('asks GET /api/schedule for the week on screen and draws what it returns', async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await liveServer(page);
    const asked: string[] = [];
    await page.route('**/api/schedule?**', (route) => {
      const url = new URL(route.request().url());
      asked.push(url.search);
      const span = { from: Date.parse(url.searchParams.get('from') ?? ''), to: Date.parse(url.searchParams.get('to') ?? '') };
      return route.fulfill({ json: buildScheduleView({ jobs, span, now: NOW.getTime(), defaultTimeZone: 'America/New_York' }) });
    });
    await page.goto('/');
    await topBarButton(page).click();
    await expect(run(page, /^Weekly campaign report, Dwight Schrute, 4:00 PM, scheduled/)).toBeVisible();
    expect(asked[0]).toBe('?from=2026-10-12T04%3A00%3A00.000Z&to=2026-10-19T04%3A00%3A00.000Z');
  });

  test('says so when the schedule can’t be loaded, and can try again', async ({ page }) => {
    await page.clock.setFixedTime(NOW);
    await liveServer(page);
    let calls = 0;
    await page.route('**/api/schedule?**', (route) => {
      calls += 1;
      return route.fulfill({ status: 500, json: { error: 'Internal error' } });
    });
    await page.goto('/');
    await topBarButton(page).click();
    await expect(calendar(page).getByRole('alert')).toContainText('Couldn’t load the schedule: Internal error');
    await calendar(page).getByRole('button', { name: 'Try again' }).click();
    await expect.poll(() => calls).toBeGreaterThan(1);
  });
});
