// Records fixtures/hermes-fixture.json: runs the live adapter once against ~/.hermes, redacts it (redact.ts),
// adds synthetic demo runs + invented chat text (fixtureExtras.ts). Usage: npm run record-fixture
import { writeFileSync } from 'node:fs';
import { createLiveSource } from '../src/hermes/liveSource.ts';
import { DEFAULT_FIXTURE, type Fixture } from '../src/hermes/fixtureSource.ts';
import { HERMES_HOME, HERMES_STATUS_URL } from '../src/config.ts';
import { redactState } from './redact.ts';
import { AUGMENTED, augmentState, syntheticMessages } from './fixtureExtras.ts';

const live = await createLiveSource({ hermesHome: HERMES_HOME, statusUrl: HERMES_STATUS_URL }).readState();
const { state } = redactState(live);
const fixture: Fixture = {
  meta: {
    recordedAt: state.recordedAt,
    hermesVersion: '0.21.6',
    note: 'Recorded from the live adapter and redacted by scripts/redact.ts: chat keys, task ids/titles, session titles, '
      + 'cron ids/names and group titles are synthetic; statuses, timestamps and structure are real. Message text is invented.',
    augmented: AUGMENTED,
  },
  state: augmentState(state),
  messages: syntheticMessages(state.recordedAt),
};
writeFileSync(DEFAULT_FIXTURE, `${JSON.stringify(fixture, null, 1)}\n`);
console.log('wrote', DEFAULT_FIXTURE.replace(process.env.HOME ?? '', '~'), '| tasks', fixture.state.kanban.tasks.length,
  '| runs', fixture.state.kanban.runs.length, '| cron', fixture.state.cron.length);
