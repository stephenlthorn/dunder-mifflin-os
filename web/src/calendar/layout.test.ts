import { describe, expect, it } from 'vitest';
import type { Occurrence, Person } from '@shared/contract';
import { BOT_COLORS, botColors, daysFor, hourLabel, laneRun, periodLabel, placeRuns, shiftAnchor, timeLabel } from './layout';

const NY = 'America/New_York';
const H = 3_600_000;
const at = (iso: string, jobKey = 'pam-0', run: Occurrence['run'] = 'upcoming'): Occurrence => ({ jobKey, at: new Date(iso).toISOString(), run });

describe('daysFor', () => {
  it('a week runs Monday to Sunday, local midnight to midnight', () => {
    const days = daysFor('week', Date.parse('2026-10-13T16:00:00Z'), NY); // a Tuesday
    expect(days.map((d) => d.key)).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
    expect(new Date(days[0]!.start).toISOString()).toBe('2026-10-12T04:00:00.000Z');
    expect(days[0]!.end).toBe(days[1]!.start);
    expect(days.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it('the day the clocks go back is 25 hours long, the day they go forward 23', () => {
    const fall = daysFor('day', Date.parse('2026-11-01T15:00:00Z'), NY)[0]!;
    expect(fall.end - fall.start).toBe(25 * H);
    const spring = daysFor('day', Date.parse('2026-03-08T15:00:00Z'), NY)[0]!;
    expect(spring.end - spring.start).toBe(23 * H);
  });

  it('a Sunday belongs to the week that started the Monday before', () => {
    expect(daysFor('week', Date.parse('2026-10-18T20:00:00Z'), NY)[0]?.key).toBe('2026-10-12');
  });
});

describe('shiftAnchor', () => {
  it('moves by a week or a day, staying on local noon across DST', () => {
    const tue = Date.parse('2026-10-27T16:00:00Z');
    expect(daysFor('week', shiftAnchor(tue, 'week', 1, NY), NY)[0]?.key).toBe('2026-11-02');
    expect(daysFor('day', shiftAnchor(tue, 'day', -1, NY), NY)[0]?.key).toBe('2026-10-26');
    const sat = Date.parse('2026-10-31T16:00:00Z');
    expect(daysFor('day', shiftAnchor(sat, 'day', 1, NY), NY)[0]?.key).toBe('2026-11-01');
    expect(daysFor('day', shiftAnchor(shiftAnchor(sat, 'day', 1, NY), 'day', 1, NY), NY)[0]?.key).toBe('2026-11-02');
  });
});

describe('placeRuns', () => {
  const week = daysFor('week', Date.parse('2026-10-13T16:00:00Z'), NY);

  it('puts each run in its local day and hour', () => {
    const placed = placeRuns([at('2026-10-13T12:30:00Z'), at('2026-10-14T03:59:00Z')], week, NY);
    expect(placed.cells.get('2026-10-13|8')?.map((o) => o.at)).toEqual(['2026-10-13T12:30:00.000Z']);
    expect(placed.cells.get('2026-10-13|23')).toHaveLength(1); // 23:59 New York is still Tuesday
    expect(placed.lanes.size).toBe(0);
  });

  it('moves a job that runs more than 6 times a day to the "frequent" lane, one summary per day', () => {
    const hourly = Array.from({ length: 24 }, (_, i) => at(new Date(Date.parse('2026-10-13T04:00:00Z') + i * H).toISOString(), 'sadiq-0',
      i === 11 ? 'failed' : 'ok'));
    const placed = placeRuns([...hourly, at('2026-10-13T12:30:00Z')], week, NY);
    expect(placed.frequent).toEqual(new Set(['sadiq-0']));
    expect(placed.lanes.get('2026-10-13')).toEqual([
      expect.objectContaining({ jobKey: 'sadiq-0', count: 24, run: 'failed', first: hourly[0], nextUp: false }),
    ]);
    expect([...placed.cells.values()].flat().map((o) => o.jobKey)).toEqual(['pam-0']);
  });

  it('leaves out runs outside the days shown', () => {
    const placed = placeRuns([at('2026-10-11T12:00:00Z'), at('2026-10-19T12:00:00Z')], week, NY);
    expect(placed.cells.size).toBe(0);
  });
});

describe('laneRun', () => {
  it('summarises a day of runs by the one that matters most', () => {
    expect(laneRun(['ok', 'failed', 'missed'])).toBe('failed');
    expect(laneRun(['ok', 'missed', 'upcoming'])).toBe('missed');
    expect(laneRun(['ok', 'unknown', 'upcoming'])).toBe('ok');
    expect(laneRun(['upcoming', 'upcoming'])).toBe('upcoming');
    expect(laneRun(['unknown'])).toBe('unknown');
  });
});

describe('botColors', () => {
  it('gives each bot a steady colour in roster order and nobody else one', () => {
    const p = (id: string, bot: boolean): Person => ({
      id, name: id, title: '', seatId: `seat.${id}`, look: { skin: '#000', hair: '#000', hairStyle: 'short', shirt: '#fff' },
      ...(bot ? { bot: { profile: id, role: '' } } : {}),
    });
    const colors = botColors([p('pam', true), p('jim', false), p('dwight', true)]);
    expect([...colors.entries()]).toEqual([['pam', BOT_COLORS[0]], ['dwight', BOT_COLORS[1]]]);
  });
});

describe('labels', () => {
  it('formats times, hours and the period in the viewer zone', () => {
    expect(timeLabel('2026-10-13T12:30:00Z', NY, 'en-US')).toBe('8:30 AM');
    expect(timeLabel('2026-10-13T12:30:00Z', 'Asia/Tokyo', 'en-US')).toBe('9:30 PM');
    expect(hourLabel(0, 'en-US')).toBe('12 AM');
    expect(hourLabel(13, 'en-US')).toBe('1 PM');
    expect(periodLabel(daysFor('week', Date.parse('2026-10-13T16:00:00Z'), NY), 'en-US')).toBe('Oct 12 – 18, 2026');
    expect(periodLabel(daysFor('week', Date.parse('2026-10-28T16:00:00Z'), NY), 'en-US')).toBe('Oct 26 – Nov 1, 2026');
    expect(periodLabel(daysFor('day', Date.parse('2026-10-13T16:00:00Z'), NY), 'en-US')).toBe('Tuesday, October 13, 2026');
  });
});
