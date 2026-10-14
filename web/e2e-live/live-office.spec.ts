// The office against live Hermes data. Truth comes from the same server's /api/office, re-read on every check
// because statuses can change while the test runs. Skipped when ~/.hermes is absent.
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Page } from '@playwright/test';
import type { OfficeSnapshot } from '../../shared/contract';
import { STATUS_META, personLabel, presenceFor } from '../src/office/status';

const HERMES = process.env.HERMES_HOME ?? path.join(os.homedir(), '.hermes');
const shot = (name: string) => fileURLToPath(new URL(`../../docs/screenshots/${name}`, import.meta.url));

test.skip(!existsSync(path.join(HERMES, 'profiles')), 'needs a real ~/.hermes');

async function liveSnapshot(page: Page): Promise<OfficeSnapshot> {
  const res = await page.request.get('/api/office');
  expect(res.ok()).toBe(true);
  return (await res.json()) as OfficeSnapshot;
}

const nameOf = (snap: OfficeSnapshot, id: string) => snap.people.find((p) => p.id === id)?.name ?? id;

let errors: string[] = [];

test.beforeEach(async ({ page }) => {
  errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/headshots|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  // read-only: nothing in this run may message a bot or create a card
  await page.route('**/api/chat', (r) => r.abort('blockedbyclient'));
  await page.route('**/api/tasks', (r) => r.abort('blockedbyclient'));
  await page.goto('/');
  await expect(page.getByTestId('source')).toHaveText('Live');
  await expect(page.locator('[data-person]')).toHaveCount(23);
});

test.afterEach(() => {
  expect(errors, 'browser console errors').toEqual([]);
});

test('the map shows the 12 bots with their real statuses', async ({ page }) => {
  await expect.poll(async () => {
    const snap = await liveSnapshot(page);
    const bots = snap.people.filter((p) => p.bot);
    const labels = await Promise.all(bots.map((p) => page.locator(`[data-person="${p.id}"]`).getAttribute('aria-label')));
    const wrong = bots.filter((p, i) => labels[i] !== personLabel(p, presenceFor(p, snap.presence)));
    return { bots: bots.length, wrong: wrong.map((p) => p.id) };
  }, { timeout: 15_000 }).toEqual({ bots: 12, wrong: [] });

  const snap = await liveSnapshot(page);
  const count = (s: string) => snap.people.filter((p) => p.bot && snap.presence[p.id]?.status === s).length;
  for (const s of ['working', 'idle', 'meeting', 'offline', 'error']) {
    await expect(page.getByTestId(`fleet-${s}`)).toHaveText(new RegExp(`^\\s*${count(s)}\\s`));
  }
  await page.waitForTimeout(1600); // walk-ins and chip layout settle
  await page.screenshot({ path: shot('live-map.png') });
});

test('the Conference Room shows the real Ops and Council members', async ({ page }) => {
  const snap = await liveSnapshot(page);
  const members = (roomId: string) => snap.rooms.find((r) => r.id === roomId)?.memberIds.map((id) => nameOf(snap, id)) ?? [];
  await page.getByRole('button', { name: /^Conference Room — / }).click();
  const ops = page.getByRole('dialog', { name: 'Conference Room — Ops room' });
  await expect(ops.getByRole('tab', { name: 'Ops' })).toHaveAttribute('aria-selected', 'true');
  expect(members('ops').length).toBeGreaterThan(0);
  await expect(ops.locator('.member-list').first().locator('li')).toHaveCount(members('ops').length);
  for (const name of members('ops')) await expect(ops.locator('.member-list').first()).toContainText(name);

  await ops.getByRole('tab', { name: 'Council' }).click();
  const council = page.getByRole('dialog', { name: 'Conference Room — Council room' });
  expect(members('council').length).toBeGreaterThanOrEqual(6);
  await expect(council.locator('.member-list').first().locator('li')).toHaveCount(members('council').length);
  for (const name of members('council')) await expect(council.locator('.member-list').first()).toContainText(name);
  await page.waitForTimeout(400);
  await page.screenshot({ path: shot('live-conference.png') });
});

test('opening Pam shows her real scheduled jobs', async ({ page }) => {
  const snap = await liveSnapshot(page);
  const jobs = snap.jobs?.pam ?? [];
  const pam = snap.people.find((p) => p.id === 'pam')!;
  await page.locator('[data-person="pam"]').click();
  const win = page.getByRole('dialog', { name: pam.name });
  await expect(win).toContainText(pam.bot!.role);
  await expect(win.getByTestId('status-line')).toContainText(STATUS_META[presenceFor(pam, snap.presence).status].legend);
  expect(jobs.length, 'Pam (chief) has scheduled jobs in ~/.hermes').toBeGreaterThan(0);
  await expect(win.locator('.job-list li')).toHaveCount(jobs.length);
  for (const job of jobs) await expect(win.locator('.job-list')).toContainText(job.name);
  await page.waitForTimeout(1200); // headshot + messages load
  await page.screenshot({ path: shot('live-person.png') });
});
