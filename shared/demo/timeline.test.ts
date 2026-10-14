import { describe, expect, it } from 'vitest';
import { dayTimeline } from './timeline';
import { hm, isoAt } from './time';

const kinds = (agent: string, at: string) => dayTimeline(agent, hm(at), 1).map((e) => `${e.kind}:${e.title}`);

describe('dayTimeline (what a demo bot did today, from the script)', () => {
  it('has its cards, its job runs, its messages and its status changes, up to the minute, newest first', () => {
    const sales = dayTimeline('sales', hm('12:30'), 1);
    expect(sales.map((e) => e.at)).toEqual([...sales.map((e) => e.at)].sort().reverse());
    expect(sales.every((e) => e.at <= isoAt(hm('12:30')))).toBe(true);
    const k = kinds('sales', '12:30');
    expect(k).toContain('task.blocked:Follow up with 40 warm leads');
    expect(k).toContain('task.finished:Follow up with 40 warm leads');
    expect(k).toContain('cron.ok:Lead sync');
    expect(k).toContain('message.out:All forty sent. Seven replies already.');
    expect(k).toContain('status:Asked for your approval');
    expect(k.some((x) => x.startsWith('activity:'))).toBe(true);
  });

  it('records the chili: the import\'s error and its failed run', () => {
    const k = kinds('imports', '11:00');
    expect(k).toContain('error:Spilled chili on the import: 3,000 rows half-loaded');
    expect(dayTimeline('imports', hm('11:00'), 1).find((e) => e.kind === 'cron.fail')).toMatchObject({ title: 'Vendor price import', detail: 'error: chili on the keyboard' });
  });

  it('only shows ambient work the bot was idle enough to pick up', () => {
    expect(kinds('sales', '12:35').filter((x) => x.includes('Researching a new lead') && x.startsWith('activity'))).toHaveLength(0);
  });

  it('is empty before the day starts and for someone not in the cast; ids are unique', () => {
    expect(dayTimeline('sales', hm('08:00'), 1)).toEqual([]);
    expect(dayTimeline('nobody', hm('12:00'), 1)).toEqual([]);
    const all = dayTimeline('it', hm('17:29'), 1);
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
  });
});
