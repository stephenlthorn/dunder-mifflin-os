import { describe, expect, it } from 'vitest';
import { STAFF } from '../office';
import { buildScheduleView } from '../schedule/view';
import { DEMO_NOW } from './demo-snapshot';
import { DEMO_ZONE, demoScheduleJobs } from './demo-schedule';
import { demoMeetings } from './demo-meetings';

const NOW = Date.parse(DEMO_NOW);
const BOTS = new Set(STAFF.filter((s) => s.bot).map((s) => s.id));
const STAFF_IDS = new Set(STAFF.map((s) => s.id));
const WEEK = { from: Date.parse('2026-10-12T04:00:00Z'), to: Date.parse('2026-10-19T04:00:00Z') };

describe('demo schedule', () => {
  const jobs = demoScheduleJobs(NOW);
  const view = buildScheduleView({ jobs, span: WEEK, now: NOW, defaultTimeZone: DEMO_ZONE });

  it('belongs to staff with bots, runs on Scranton time, and every job has a rule', () => {
    for (const [personId, list] of Object.entries(jobs)) {
      expect(BOTS.has(personId), personId).toBe(true);
      for (const j of list) expect(j).toMatchObject({ timeZone: 'America/New_York', rule: expect.any(Object) });
    }
    expect(Object.keys(jobs).length).toBeGreaterThanOrEqual(10);
  });

  it('shows every kind of run in the demo week: ok, failed, missed, upcoming, and a next one up', () => {
    const runs = new Set(view.occurrences.map((o) => o.run));
    for (const run of ['ok', 'failed', 'missed', 'upcoming']) expect(runs.has(run as never), run).toBe(true);
    expect(view.nextUp && Date.parse(view.nextUp.at)).toBeGreaterThan(NOW);
    expect(view.occurrences.some((o) => o.offSchedule)).toBe(false); // last runs line up with the rules
  });

  it('a paused job only shows its last run', () => {
    const paused = view.jobs.find((j) => !j.enabled);
    expect(paused).toBeDefined();
    expect(view.occurrences.filter((o) => o.jobKey === paused?.key).every((o) => Date.parse(o.at) < NOW)).toBe(true);
  });
});

describe('demo meetings', () => {
  const view = demoMeetings(NOW);

  it('has Council sessions and shared cards in every state', () => {
    expect(new Set(view.meetings.map((m) => m.kind))).toEqual(new Set(['council', 'shared-task']));
    expect(new Set(view.meetings.map((m) => m.status))).toEqual(new Set(['in-session', 'blocked', 'scheduled', 'adjourned']));
  });

  it('only names real staff, keeps lines in order and ends only adjourned meetings', () => {
    for (const m of view.meetings) {
      for (const id of [...m.participantIds, ...m.agenda.flatMap((a) => a.ownerId ?? []), ...m.lines.flatMap((l) => l.personId ?? [])]) {
        expect(STAFF_IDS.has(id), `${m.id}: ${id}`).toBe(true);
      }
      const times = m.lines.map((l) => l.at);
      expect([...times].sort(), m.id).toEqual(times);
      expect(m.endedAt !== undefined, m.id).toBe(m.status === 'adjourned');
      expect(Date.parse(m.startedAt)).toBeLessThanOrEqual(NOW);
    }
    const starts = view.meetings.map((m) => m.startedAt);
    expect([...starts].sort().reverse()).toEqual(starts);
  });
});
