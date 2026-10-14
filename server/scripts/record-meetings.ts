// Records fixtures/hermes-meetings.json: reads the meeting records of the last 7 days from ~/.hermes/kanban.db
// (read-only), redacts them (redactMeetings.ts) and writes the fixture. Usage: npm run record-meetings -w @dmos/server
import { writeFileSync } from 'node:fs';
import { createLiveSource } from '../src/hermes/liveSource.ts';
import { DEFAULT_MEETINGS_FIXTURE, type MeetingsFixture } from '../src/hermes/meetingsFixture.ts';
import { HERMES_HOME } from '../src/config.ts';
import { chatRemap } from './redact.ts';
import { redactMeetings } from './redactMeetings.ts';

const DAYS = 7;
const now = Date.now() / 1000;
const source = createLiveSource({ hermesHome: HERMES_HOME, statusUrl: null });
const state = await source.readState();
const records = await source.readMeetingRecords?.({ from: now - DAYS * 86_400, to: now + 3600 });
if (!records) throw new Error('kanban.db could not be read');
const fixture: MeetingsFixture = {
  meta: {
    hermesVersion: '0.21.6',
    note: `Meeting records of ${DAYS} days, recorded from kanban.db (read-only) and redacted by scripts/redactMeetings.ts: task ids, `
      + 'titles (except council process titles like "round 2 cfo"), comments, run summaries, block reasons and chat keys are synthetic; '
      + 'statuses, event kinds, who did what and timestamps are real.',
  },
  recordedAt: new Date(now * 1000).toISOString(),
  records: redactMeetings(records, chatRemap(state)),
};
writeFileSync(DEFAULT_MEETINGS_FIXTURE, `${JSON.stringify(fixture, null, 1)}\n`);
const r = fixture.records;
console.log('wrote', DEFAULT_MEETINGS_FIXTURE.replace(process.env.HOME ?? '', '~'), '| tasks', r.tasks.length, '| runs', r.runs.length,
  '| comments', r.comments.length, '| events', r.events.length, '| subs', r.subs.length, '| links', r.links.length);
