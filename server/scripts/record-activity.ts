// Records fixtures/hermes-activity.json: reads each bot's last day of activity and 31 days of token usage from the
// live ~/.hermes (read-only), redacts it (redactActivity.ts) and moves every time so the recording lines up with
// fixtures/hermes-fixture.json (recordedAt). Prints counts only. Usage: npm run record-activity -w @dmos/server
import { writeFileSync } from 'node:fs';
import { createLiveActivity } from '../src/hermes/liveActivity.ts';
import { DEFAULT_ACTIVITY_FIXTURE, shiftActivity, type ActivityFixture } from '../src/hermes/fixtureActivity.ts';
import { loadFixture } from '../src/hermes/fixtureSource.ts';
import type { UsageRecord } from '../src/hermes/activityTypes.ts';
import { HERMES_HOME } from '../src/config.ts';
import { BOT_PROFILES } from '../src/roster.ts';
import { redactActivity, redactUsage } from './redactActivity.ts';

const PER_LIST = 40;
const DAYS = 31;
const now = Math.floor(Date.now() / 1000);
const shift = Math.round(Date.parse(loadFixture().state.recordedAt) / 1000) - now;
const live = createLiveActivity({ hermesHome: HERMES_HOME });

function dayWindows(): Array<{ from: number; to: number }> {
  const midnight = new Date(now * 1000);
  midnight.setHours(0, 0, 0, 0);
  return Array.from({ length: DAYS }, (_, i) => {
    const start = new Date(midnight);
    start.setDate(start.getDate() - i);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { from: start.getTime() / 1000, to: Math.min(end.getTime() / 1000, now) };
  });
}

async function usageOf(profile: string): Promise<UsageRecord[]> {
  const days = await Promise.all(dayWindows().map(async (w) => ((await live.readUsage(profile, w.from, w.to)) ?? [])
    .filter((m) => m.inputTokens + m.outputTokens + m.cacheReadTokens + m.cacheWriteTokens > 0)
    .map((m): UsageRecord => ({ ...m, at: w.to - 60 }))));
  return redactUsage(days.flat()).map((u) => ({ ...u, at: u.at + shift }));
}

const profiles = Object.fromEntries(await Promise.all(BOT_PROFILES.map(async (p) => {
  const raw = await live.readActivity(p, now - 86_400, PER_LIST);
  const activity = raw ? shiftActivity(redactActivity(p, raw), shift) : shiftActivity({ sessions: [], messages: [], tools: [], tasks: [], runs: [], cron: [], errors: [] }, 0);
  return [p, { activity, usage: await usageOf(p) }] as const;
})));

const fixture: ActivityFixture = {
  meta: {
    recordedAt: new Date((now + shift) * 1000).toISOString(),
    hermesVersion: '0.21.6',
    note: 'Recorded from the live timeline/usage readers and redacted by scripts/redactActivity.ts: ids, session titles, task titles, '
      + 'job names, MCP/custom tool names, log messages and message text are synthetic; times, counts, outcomes, models and token numbers are real. '
      + 'Times are moved to line up with hermes-fixture.json.',
  },
  recordedAt: new Date((now + shift) * 1000).toISOString(),
  profiles,
};
writeFileSync(DEFAULT_ACTIVITY_FIXTURE, `${JSON.stringify(fixture, null, 1)}\n`);
for (const [p, { activity: a, usage }] of Object.entries(profiles)) {
  console.log(p.padEnd(14), 'sessions', a.sessions.length, '| messages', a.messages.length, '| tool bursts', a.tools.length, '| tasks', a.tasks.length,
    '| runs', a.runs.length, '| cron', a.cron.length, '| errors', a.errors.length, '| usage rows', usage.length);
}
