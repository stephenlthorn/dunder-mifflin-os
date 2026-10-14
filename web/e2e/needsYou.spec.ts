// "Needs you": hands go up, Pam's phone rings, the top bar counts, and HR · Approvals at Toby's desk decides.
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { Approval, OfficeSnapshot } from '../../shared/contract';
import { DEMO_APPROVALS, DEMO_OFFICE } from '../../shared/fixtures/demo-approvals';
import { fakeState, installFakes, liveWithFeed } from './fakes';
import { liveServer, noServer, person } from './helpers';

const out = (name: string) => fileURLToPath(new URL(`../../docs/screenshots/${name}`, import.meta.url));
const ANDY = DEMO_APPROVALS[0]!;
const inbox = (page: Page) => page.getByRole('dialog', { name: 'HR · Approvals' });
const item = (page: Page, a: Approval) => inbox(page).locator(`[data-approval="${a.id}"]`);
const LIVE: OfficeSnapshot = { ...DEMO_OFFICE, capabilities: { writes: true } };

test.describe('needs you on the map', () => {
  test.beforeEach(async ({ page }) => {
    await noServer(page);
    await page.goto('/?demo=1');
    await expect(page.locator('[data-person]')).toHaveCount(23);
  });

  test('hands go up over whoever is asking, Pam\'s phone rings, and the top bar counts them', async ({ page }) => {
    await expect(page.locator('[data-person="andy"] .raised-hand')).toBeVisible();
    await expect(page.locator('[data-person="sadiq"]')).toHaveAttribute('data-asking', 'true'); // in error, still asking
    await expect(page.locator('[data-person="dwight"] .raised-hand')).toHaveCount(0);
    await expect(page.locator('.reception-phone.is-ringing')).toHaveCount(1);
    await expect(page.locator('.reception-phone .phone-badge')).toHaveText('4');
    await expect(page.getByTestId('need-you')).toHaveAccessibleName('4 need you: open HR · Approvals');
    await expect(person(page, 'Andy Bernard — skool — needs you')).toBeVisible();
  });

  test('clicking Toby opens HR · Approvals at his desk; he stays "No bot yet"', async ({ page }) => {
    await person(page, /^Toby Flenderson — no bot yet — HR · Approvals/).click();
    await expect(inbox(page)).toBeVisible();
    await expect(inbox(page)).toContainText("Toby Flenderson's desk");
    await expect(page.getByRole('dialog', { name: 'Toby Flenderson' })).toHaveCount(0);
    await expect(inbox(page).locator('[data-approval]')).toHaveCount(4);
  });

  test('the counter opens it too, and approving lowers the hand and stops the count', async ({ page }) => {
    await page.getByTestId('need-you').click();
    await item(page, ANDY).getByLabel(/Note/).fill('Go ahead, skip the opt-outs');
    await item(page, ANDY).getByRole('button', { name: 'Approve' }).click();
    await expect(item(page, ANDY)).toHaveCount(0);
    await expect(page.locator('[data-person="andy"] .raised-hand')).toHaveCount(0);
    await expect(page.getByTestId('need-you')).toHaveAccessibleName('3 need you: open HR · Approvals');
    await expect(person(page, /^Andy Bernard — skool — working/)).toBeVisible();
  });

  test('a request the office only shows has no buttons', async ({ page }) => {
    await page.getByTestId('need-you').click();
    const kelly = item(page, DEMO_APPROVALS[3]!);
    await expect(kelly).toContainText('Answer this one where Kelly Kapoor runs');
    await expect(kelly.getByRole('button', { name: 'Approve' })).toHaveCount(0);
  });
});

test.describe('deciding against the server', () => {
  test('POSTs the decision and note, then the update takes it out of the inbox', async ({ page }) => {
    await liveServer(page, [], LIVE);
    const posted: Array<{ url: string; body: unknown }> = [];
    await page.route('**/api/approvals/*', (route) => {
      posted.push({ url: route.request().url(), body: route.request().postDataJSON() });
      return route.fulfill({ json: { ok: true } });
    });
    await page.goto('/');
    await expect(page.getByTestId('source')).toHaveText('Live');
    await page.getByTestId('need-you').click();
    const sadiq = item(page, DEMO_APPROVALS[1]!);
    await sadiq.getByLabel(/Note/).fill('Not during the Council meeting');
    await sadiq.getByRole('button', { name: 'Reject' }).click();
    await expect(sadiq).toHaveCount(0);
    expect(posted).toEqual([{ url: expect.stringContaining('/api/approvals/hermes%3At_demo_gateway.blocked'), body: { decision: 'reject', note: 'Not during the Council meeting' } }]);
  });

  test('shows the server\'s reason when it refuses, and keeps the request', async ({ page }) => {
    await liveServer(page, [], LIVE);
    await page.route('**/api/approvals/*', (route) => route.fulfill({ status: 409, json: { error: 'That card has moved on since it was listed' } }));
    await page.goto('/');
    await page.getByTestId('need-you').click();
    await item(page, ANDY).getByRole('button', { name: 'Approve' }).click();
    await expect(item(page, ANDY).getByRole('alert')).toHaveText('That card has moved on since it was listed');
    await expect(item(page, ANDY)).toHaveCount(1);
  });

  test('on a read-only server the buttons are off and say how to turn writes on', async ({ page }) => {
    await liveServer(page, [], { ...DEMO_OFFICE, capabilities: { writes: false } });
    let posts = 0;
    await page.route('**/api/approvals/*', (route) => { posts += 1; return route.fulfill({ status: 403, json: { error: 'Read-only' } }); });
    await page.goto('/');
    await page.getByTestId('need-you').click();
    await expect(item(page, ANDY).getByRole('button', { name: 'Approve' })).toBeDisabled();
    await expect(item(page, ANDY).getByRole('button', { name: 'Reject' })).toBeDisabled();
    await expect(item(page, ANDY)).toContainText('DMOS_ALLOW_WRITES=1');
    expect(posts).toBe(0);
  });

  test('a new request the status doesn\'t show rings the phone with the chime, if the chime is on', async ({ page }) => {
    await installFakes(page);
    await page.addInitScript(() => localStorage.setItem('dmos.prefs.v1', JSON.stringify({ chime: true })));
    const feed = await liveWithFeed(page);
    await page.goto('/');
    await expect(page.getByTestId('source')).toHaveText('Live');
    await expect(page.getByTestId('need-you')).toHaveAccessibleName('0 need you: open HR · Approvals');
    feed.push([{ approvals: [DEMO_APPROVALS[2]] }]); // from an agent without a desk: no needs-input to chime for
    await expect(page.locator('.reception-phone.is-ringing')).toHaveCount(1);
    await expect.poll(async () => (await fakeState(page)).tones).toBeGreaterThan(0);
  });
});

test.describe('@screenshot needs-you screenshots', () => {
  test.beforeEach(async ({ page }) => {
    await noServer(page);
    await page.goto('/?demo=1');
    await expect(page.locator('[data-person]')).toHaveCount(23);
    await page.emulateMedia({ reducedMotion: 'reduce' }); // a still frame: hand up, phone waves shown
    await page.waitForTimeout(1600);
  });

  test('raised hands and the ringing phone', async ({ page }) => {
    const box = async (id: string) => (await page.locator(`[data-person="${id}"]`).boundingBox())!;
    const [andy, pam] = [await box('andy'), await box('pam')];
    await page.mouse.move((andy.x + pam.x) / 2, (andy.y + pam.y) / 2);
    for (let i = 0; i < 3; i += 1) {
      await page.mouse.wheel(0, -240);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(400);
    await page.screenshot({ path: out('needs-you-hand.png') });
  });

  test('HR · Approvals at Toby\'s desk', async ({ page }) => {
    await person(page, /^Toby Flenderson — /).click();
    await expect(inbox(page)).toBeVisible();
    await page.screenshot({ path: out('approvals-inbox.png') });
  });
});
