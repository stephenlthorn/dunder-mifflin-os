// Browser stand-ins for the notification tests: a fake Notification API, a counting AudioContext, a switchable
// "away" state (tab hidden / window blurred) and an SSE stream the test feeds one batch at a time.
import type { Page } from '@playwright/test';
import { DEMO_SNAPSHOT } from '../../shared/fixtures/demo-snapshot';

type FakeOptions = { permission?: 'default' | 'granted' | 'denied'; answer?: 'granted' | 'denied' };

export async function installFakes(page: Page, opts: FakeOptions = {}) {
  await page.addInitScript(({ permission, answer }) => {
    const w = window as unknown as Record<string, unknown>;
    w.__notes = [];
    w.__permAsked = 0;
    w.__tones = 0;
    w.__away = false;
    class FakeNotification {
      static permission = permission;
      static async requestPermission() {
        w.__permAsked = (w.__permAsked as number) + 1;
        FakeNotification.permission = answer;
        return answer;
      }
      onclick: (() => void) | null = null;
      constructor(title: string, o?: { body?: string }) { (w.__notes as unknown[]).push({ title, body: o?.body }); }
      close() {}
    }
    w.Notification = FakeNotification;
    const param = () => ({ setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
    class FakeAudio {
      state = 'running';
      currentTime = 0;
      destination = {};
      resume() { return Promise.resolve(); }
      createGain() { return { gain: param(), connect: (x: unknown) => x }; }
      createOscillator() {
        w.__tones = (w.__tones as number) + 1;
        return { type: 'sine', frequency: param(), connect: (x: unknown) => x, start() {}, stop() {} };
      }
    }
    w.AudioContext = FakeAudio;
    Object.defineProperty(document, 'visibilityState', { get: () => (w.__away ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { get: () => Boolean(w.__away) });
    document.hasFocus = () => !w.__away;
    w.__setAway = (away: boolean) => {
      w.__away = away;
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event(away ? 'blur' : 'focus'));
    };
  }, { permission: opts.permission ?? 'default', answer: opts.answer ?? 'granted' });
}

export const setAway = (page: Page, away: boolean) => page.evaluate((a) => (window as unknown as { __setAway: (v: boolean) => void }).__setAway(a), away);
export const fakeState = (page: Page) => page.evaluate(() => {
  const w = window as unknown as { __notes: { title: string; body?: string }[]; __permAsked: number; __tones: number };
  return { notes: w.__notes, permAsked: w.__permAsked, tones: w.__tones };
});

/** A live server whose SSE stream sends nothing at first; each `push` is delivered on the browser's next reconnect. */
export async function liveWithFeed(page: Page) {
  const queue: unknown[][] = [];
  const waiting: ((events: unknown[]) => void)[] = [];
  let first = true;
  await page.route('**/api/office', (route) => route.fulfill({ json: DEMO_SNAPSHOT }));
  await page.route('**/api/rooms/*/messages', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/portraits/*', (route) => route.fulfill({ status: 404, body: '' }));
  await page.route('**/api/events', async (route) => {
    const events = first ? [] : (queue.shift() ?? await new Promise<unknown[]>((resolve) => waiting.push(resolve)));
    first = false;
    await route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' },
      body: `retry: 150\n\n${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('')}`,
    }).catch(() => {});
  });
  return {
    push: (events: unknown[]) => {
      const next = waiting.shift();
      if (next) next(events);
      else queue.push(events);
    },
  };
}
