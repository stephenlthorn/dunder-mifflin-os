import { describe, expect, it } from 'vitest';
import type { Meeting, Person } from '@shared/contract';
import { MEETING_META, durationText, filterMeetings, lineWho, presentText, proceedingsText } from './memo';

const person = (id: string, name: string, bot = true): Person => ({
  id, name, title: '', seatId: `seat.${id}`, look: { skin: '#000', hair: '#000', hairStyle: 'short', shirt: '#fff' }, ...(bot ? { bot: { profile: id, role: '' } } : {}),
});
const PEOPLE = new Map([['pam', person('pam', 'Pam Beesly')], ['michael', person('michael', 'Michael Scott')]]);
const meeting = (m: Partial<Meeting>): Meeting => ({
  id: 'm1', kind: 'council', title: 'Council 2026-10-08', roomId: 'council', status: 'adjourned', startedAt: '2026-10-08T13:00:00Z',
  participantIds: ['pam', 'michael'], agenda: [], lines: [], ...m,
});

describe('durationText', () => {
  it('says how long a meeting ran, or that it is still going', () => {
    expect(durationText('2026-10-08T13:00:00Z', '2026-10-08T13:49:00Z')).toBe('49 min');
    expect(durationText('2026-10-08T13:00:00Z', '2026-10-08T15:05:00Z')).toBe('2 h 5 min');
    expect(durationText('2026-10-08T13:00:00Z', '2026-10-08T13:00:20Z')).toBe('under a minute');
    expect(durationText('2026-10-08T13:00:00Z', undefined)).toBe('still in session');
  });
});

describe('presentText', () => {
  it('lists who was present, the chair marked for a Council session', () => {
    expect(presentText(meeting({}), PEOPLE)).toBe('Pam Beesly (chair), Michael Scott');
    expect(presentText(meeting({ kind: 'shared-task' }), PEOPLE)).toBe('Pam Beesly (owner), Michael Scott');
    expect(presentText(meeting({ participantIds: ['ghost'] }), PEOPLE)).toBe('ghost (chair)');
    expect(presentText(meeting({ participantIds: [] }), PEOPLE)).toBe('Nobody on record');
  });
});

describe('lineWho', () => {
  it('names a bot by its person, or the label it came with', () => {
    expect(lineWho({ at: '', kind: 'comment', personId: 'pam', text: '' }, PEOPLE)).toBe('Pam Beesly');
    expect(lineWho({ at: '', kind: 'comment', author: 'You', text: '' }, PEOPLE)).toBe('You');
    expect(lineWho({ at: '', kind: 'closed', text: '' }, PEOPLE)).toBe('');
  });
});

describe('filterMeetings and MEETING_META', () => {
  it('filters by kind', () => {
    const list = [meeting({ id: 'a' }), meeting({ id: 'b', kind: 'shared-task' })];
    expect(filterMeetings(list, 'all').map((m) => m.id)).toEqual(['a', 'b']);
    expect(filterMeetings(list, 'council').map((m) => m.id)).toEqual(['a']);
    expect(filterMeetings(list, 'shared-task').map((m) => m.id)).toEqual(['b']);
  });

  it('has words for every meeting status', () => {
    for (const s of ['scheduled', 'in-session', 'blocked', 'adjourned'] as const) expect(MEETING_META[s].word.length).toBeGreaterThan(0);
  });
});

describe('proceedingsText', () => {
  const clock = (iso: string) => iso.slice(11, 16);
  it('opens the memo with how the meeting stands', () => {
    expect(proceedingsText(meeting({ endedAt: '2026-10-08T13:49:00Z' }), clock)).toBe('Called to order 13:00, adjourned 13:49 (49 min).');
    expect(proceedingsText(meeting({ status: 'in-session' }), clock)).toBe('Called to order 13:00; still in session.');
    expect(proceedingsText(meeting({ status: 'blocked' }), clock)).toBe('Called to order 13:00; blocked, waiting on someone.');
    expect(proceedingsText(meeting({ status: 'scheduled' }), clock)).toBe('Card opened 13:00; not started yet.');
  });
});
