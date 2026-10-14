import { describe, expect, it } from 'vitest';
import { parseMeetingsView, parseScheduleView } from './calendarGuards';

const ISO = '2026-10-13T12:30:00.000Z';
const job = { key: 'pam-0', personId: 'pam', name: 'Morning report', schedule: '30 8 * * 1-5', repeats: 'cron', enabled: true, timeZone: 'America/New_York' };
const schedule = {
  from: '2026-10-12T04:00:00.000Z', to: '2026-10-19T04:00:00.000Z', generatedAt: ISO, timeZone: 'America/New_York',
  jobs: [job], occurrences: [{ jobKey: 'pam-0', at: ISO, run: 'ok', nextUp: true }], nextUp: { jobKey: 'pam-0', at: ISO },
};

describe('parseScheduleView', () => {
  it('accepts a well-formed view', () => {
    expect(parseScheduleView(schedule)).toEqual(schedule);
  });

  it('drops bad jobs and runs (unknown job, bad time, unknown status) instead of failing', () => {
    const view = parseScheduleView({
      ...schedule,
      jobs: [job, { ...job, key: '' }, { ...job, key: 'x', repeats: 'sometimes' }, 'nope'],
      occurrences: [
        { jobKey: 'pam-0', at: ISO, run: 'ok' }, { jobKey: 'ghost-0', at: ISO, run: 'ok' }, { jobKey: 'pam-0', at: 'soon', run: 'ok' },
        { jobKey: 'pam-0', at: ISO, run: 'great' },
      ],
    });
    expect(view?.jobs.map((j) => j.key)).toEqual(['pam-0']);
    expect(view?.occurrences).toEqual([{ jobKey: 'pam-0', at: ISO, run: 'ok' }]);
  });

  it('clips long text and keeps only known optional fields', () => {
    const view = parseScheduleView({ ...schedule, jobs: [{ ...job, name: 'x'.repeat(900), extra: 'no', lastStatus: 'ok' }] });
    expect(view?.jobs[0]?.name).toHaveLength(200);
    expect(view?.jobs[0]).not.toHaveProperty('extra');
    expect(view?.jobs[0]?.lastStatus).toBe('ok');
  });

  it('rejects what is not a schedule', () => {
    expect(parseScheduleView(null)).toBeNull();
    expect(parseScheduleView({ ...schedule, from: 'monday' })).toBeNull();
    expect(parseScheduleView({ ...schedule, jobs: 'all' })).toBeNull();
    expect(parseScheduleView({ error: 'Sign in required' })).toBeNull();
  });
});

const meeting = {
  id: 'hermes-council-t1', kind: 'council', title: 'Council 2026-10-08', roomId: 'council', status: 'adjourned',
  startedAt: ISO, endedAt: ISO, participantIds: ['pam', 'michael'],
  agenda: [{ taskId: 't1', title: 'round 1 cmo', ownerId: 'michael', status: 'done' }],
  lines: [{ at: ISO, kind: 'opened', author: 'Council', text: 'Session opened' }, { at: ISO, kind: 'result', personId: 'michael', text: 'Raise prices.' }],
};
const meetings = { from: ISO, to: ISO, generatedAt: ISO, meetings: [meeting] };

describe('parseMeetingsView', () => {
  it('accepts a well-formed view', () => {
    expect(parseMeetingsView(meetings)).toEqual(meetings);
  });

  it('drops malformed meetings and lines', () => {
    const view = parseMeetingsView({
      ...meetings,
      meetings: [
        { ...meeting, lines: [...meeting.lines, { at: ISO, kind: 'gossip', text: 'x' }, { at: 'later', kind: 'comment', text: 'y' }] },
        { ...meeting, id: 'm2', kind: 'party' },
        { ...meeting, id: 'm3', startedAt: 'yesterday' },
        { ...meeting, id: 'm4', participantIds: ['pam', 7] },
      ],
    });
    expect(view?.meetings.map((m) => m.id)).toEqual(['hermes-council-t1', 'm4']);
    expect(view?.meetings[0]?.lines).toHaveLength(2);
    expect(view?.meetings[1]?.participantIds).toEqual(['pam']);
  });

  it('rejects what is not a meetings view', () => {
    expect(parseMeetingsView([])).toBeNull();
    expect(parseMeetingsView({ ...meetings, meetings: {} })).toBeNull();
  });
});
