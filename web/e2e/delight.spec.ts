// The delight layer in the browser, on the demo day (demo.html: no server). Every joke carries real information,
// Toby mode turns them all off (same information), and reduced motion stills them.
import { expect, type Page, test } from '@playwright/test';
import { noServer, person } from './helpers';
import { seatOf } from './demoDay';

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];

async function askPam(page: Page, text: string) {
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('combobox', { name: 'Ask Pam' }).fill(text);
  await page.keyboard.press('Enter');
}

async function openDay(page: Page, query: string) {
  await page.goto(`/demo.html?${query}`);
  await expect(page.locator('[data-person]')).toHaveCount(23);
}

test.beforeEach(async ({ page }) => {
  await noServer(page); // the in-browser demo office answers every /api call
});

test.describe('the delight layer', () => {
  test('a Dundies ceremony: Michael hands out awards won on real numbers, and trophies go on the winners\' desks', async ({ page }) => {
    await openDay(page, 'at=16:50&speed=1');
    await askPam(page, 'dundies');
    const win = page.getByRole('dialog', { name: 'The Dundies' });
    await expect(win.locator('.dundies-podium')).toBeVisible(); // Michael presents
    const award = (id: string) => win.locator(`[data-dundie="${id}"]`);
    await expect(award('hottest')).toContainText('Hottest in the Office');
    await expect(award('hottest')).toContainText('2 cards done');
    await expect(award('fine-work')).toContainText('Dwight Schrute');
    await expect(award('fine-work')).toContainText('approval turned around in 42 min'); // blocked 10:58, back at work 11:40
    await expect(award('dont-go-in')).toContainText('Kevin Malone');
    await expect(award('dont-go-in')).toContainText('Spilled chili on the import');
    await expect(page.locator('[data-trophy-for="dwight"]')).toHaveCount(1);
    await expect(page.locator('[data-trophy-for="kevin"]')).toHaveCount(0); // the error award gets no trophy
    await award('fine-work').getByRole('button', { name: /Dwight Schrute/ }).click();
    await expect(page.getByRole('dialog', { name: 'Dwight Schrute' })).toBeVisible();
  });

  test('an error spills Kevin\'s chili at his desk once, and his chip still says what went wrong', async ({ page }) => {
    await openDay(page, 'at=11:05');
    await expect(person(page, 'Kevin Malone — imports — error')).toBeVisible();
    const spill = page.locator('[data-seat="seat.kevin"] [data-chili]');
    await expect(spill).toHaveCount(1);
    expect(await spill.locator('.chili-puddle').evaluate((el) => getComputedStyle(el).animationIterationCount)).toBe('1');
    await expect(page.locator('.chip.chip-error')).toContainText('Error: Spilled chil');
    await expect(page.locator('[data-chili]')).toHaveCount(1); // only the bot in error
  });

  test('Creed knows something: clicking him shows the raw unattributed items', async ({ page }) => {
    await openDay(page, 'at=11:05');
    await expect(page.locator('[data-creed-note]')).toHaveCount(1);
    await person(page, /^Creed Bratton — no bot yet — Creed’s corner: 3 things/).click();
    const corner = page.getByRole('dialog', { name: 'Creed’s corner' });
    await expect(corner.locator('[data-unattributed]')).toHaveCount(3);
    await expect(corner).toContainText('Shred the 2004 expense reports');
    await expect(corner).toContainText('id: card:demo-stray-shred');
  });

  test('easter eggs: the Konami code, the boss mug, "that\'s what she said" and parkour, all carrying real numbers', async ({ page }) => {
    await openDay(page, 'at=11:05');
    for (const key of KONAMI) await page.keyboard.press(key);
    const credits = page.getByRole('dialog', { name: 'Threat Level Midnight credits' });
    await expect(credits).toContainText('Dwight Schrute');
    await expect(credits).toContainText('as Sales: leads and follow-ups');
    await credits.getByRole('button', { name: 'Close' }).click();
    await expect(credits).toBeHidden();

    await page.locator('.egg-mug').dispatchEvent('click');
    await expect(page.locator('[data-toast]').last()).toContainText('World’s Best Boss');
    await expect(page.locator('[data-toast]').last()).toContainText('1 needing you');

    await person(page, /^Dwight Schrute — /).click();
    const dwight = page.getByRole('dialog', { name: 'Dwight Schrute' });
    await dwight.getByLabel('Message Direct line').fill('That list is way too big to send at once.');
    await dwight.getByRole('button', { name: 'Send' }).click();
    await expect(page.locator('[data-toast]').last()).toContainText('That’s what she said!');
    await expect(page.locator('[data-toast]').last()).toContainText('— You');
    await page.keyboard.press('Escape');

    await page.mouse.move(120, 560);
    await page.mouse.down();
    for (let i = 1; i <= 5; i += 1) {
      await page.mouse.move(120 + i * 240, 560); // a flick: thousands of pixels a second
      await page.waitForTimeout(10);
    }
    await page.mouse.up();
    await expect(page.locator('[data-toast]').last()).toContainText('Parkour!');
  });

  test('Stanley\'s crossword at 15:00 has today\'s cards for an answer', async ({ page }) => {
    await openDay(page, 'at=15:02&speed=1');
    await page.locator('.egg-crossword').dispatchEvent('click');
    await expect(page.locator('[data-toast]').last()).toContainText('7 across: cards the bots finished today');
  });

  test('Toby mode (?toby=1): the same information, no jokes, no easter eggs', async ({ page }) => {
    await openDay(page, 'at=11:05&toby=1');
    await expect(person(page, 'Kevin Malone — imports — error')).toBeVisible();
    await expect(page.locator('[data-chili], [data-creed-note], [data-trophy], .map-egg')).toHaveCount(0);
    await expect(page.locator('.map-wrap')).not.toHaveAttribute('data-daylight', /./);
    await expect(person(page, 'Creed Bratton — no bot yet — Unattributed activity: 3 items')).toBeVisible();
    for (const key of KONAMI) await page.keyboard.press(key);
    await expect(page.getByTestId('credits')).toHaveCount(0);

    await askPam(page, 'weekly review');
    const review = page.getByRole('dialog', { name: 'Weekly review' });
    await expect(review.locator('[data-dundie="dont-go-in"]')).toContainText('Most errors');
    await expect(review).not.toContainText('Don’t Go in There After Me');
    await expect(review.locator('.dundies-podium')).toHaveCount(0);
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Settings' }).click();
    const toby = page.getByRole('dialog', { name: 'Settings' }).getByRole('switch', { name: /Toby mode/ });
    await expect(toby).toBeChecked();
    await expect(toby).toBeDisabled(); // on for this page by its address
  });

  test('Toby mode from Settings turns the jokes off, and back on', async ({ page }) => {
    await openDay(page, 'at=11:05');
    await expect(page.locator('[data-chili]')).toHaveCount(1);
    await page.getByRole('button', { name: 'Settings' }).click();
    const toby = page.getByRole('dialog', { name: 'Settings' }).getByRole('switch', { name: /Toby mode/ });
    await toby.check();
    await expect(page.locator('[data-chili], [data-creed-note]')).toHaveCount(0);
    await expect(page.locator('.os')).toHaveClass(/toby-mode/);
    await toby.uncheck();
    await expect(page.locator('[data-chili]')).toHaveCount(1);
  });

  test('ambient life: an idle bot goes for coffee, and Dwight\'s bobblehead nods when his bot finishes its card', async ({ page }) => {
    await openDay(page, 'at=09:06&speed=1'); // Andy is idle at 09:05 and (seed 1) gets a coffee at 09:05-09:07
    await expect.poll(() => seatOf(page, 'andy')).toMatch(/^spot\.coffee\./);
    await expect(person(page, 'Andy Bernard — community — idle')).toBeVisible(); // still found by his status
    await expect(page.locator('.chip').filter({ hasText: 'Idle · getting coff' })).toHaveCount(1); // (clipped when zoomed out)
    await openDay(page, 'at=12:19'); // the 40 follow-up emails are done at 12:20, a second later at 60x
    await expect(page.locator('.map-wrap.is-nodding')).toHaveCount(1, { timeout: 8000 });
    expect(await page.locator('.bobble-head').evaluate((el) => getComputedStyle(el).animationName)).toBe('dm-nod');
  });

  test('reduced motion: the jokes stay, nothing moves, and nobody wanders off for coffee', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openDay(page, 'at=11:05');
    const puddle = page.locator('[data-seat="seat.kevin"] .chili-puddle');
    await expect(puddle).toHaveCount(1);
    expect(await puddle.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    expect(await page.locator('[data-creed-note]').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await expect(page.locator('[data-seat^="spot."] [data-person]')).toHaveCount(0);
  });
});
