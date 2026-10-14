import { describe, expect, it } from 'vitest';
import type { Person } from '@shared/contract';
import { chipText, fleetCounts, personLabel, presenceFor, statusWord } from './status';

const dwight: Person = {
  id: 'dwight', name: 'Dwight Schrute', title: 'ARM', seatId: 'seat.dwight', bot: { profile: 'campaigns', role: 'Campaigns' },
  look: { skin: '#fff', hair: '#000', hairStyle: 'center-part', shirt: '#ff0' },
};
const jim: Person = { id: 'jim', name: 'Jim Halpert', title: 'Sales', seatId: 'seat.jim', look: dwight.look };

describe('presenceFor', () => {
  it('returns the reported presence', () => {
    expect(presenceFor(dwight, { dwight: { status: 'working' } }).status).toBe('working');
  });
  it('defaults a bot with no report to offline and a person without a bot to no-bot', () => {
    expect(presenceFor(dwight, {}).status).toBe('offline');
    expect(presenceFor(jim, {}).status).toBe('no-bot');
  });
  it('treats a reported status for someone without a bot as no-bot', () => {
    expect(presenceFor(jim, { jim: { status: 'working' } }).status).toBe('no-bot');
  });
});

describe('personLabel', () => {
  it('reads "name — profile — status" for bots', () => {
    expect(personLabel(dwight, { status: 'working' })).toBe('Dwight Schrute — campaigns — working');
    expect(personLabel(dwight, { status: 'meeting' })).toBe('Dwight Schrute — campaigns — in a meeting');
  });
  it('reads "name — no bot yet" for unbotted staff', () => {
    expect(personLabel(jim, { status: 'no-bot' })).toBe('Jim Halpert — no bot yet');
  });
});

describe('statusWord', () => {
  it('names every status', () => {
    expect(['working', 'idle', 'offline', 'error', 'meeting', 'needs-input', 'no-bot'].map((s) => statusWord(s as never))).toEqual(
      ['working', 'idle', 'offline', 'error', 'in a meeting', 'needs you', 'no bot yet'],
    );
  });
});

describe('chipText', () => {
  it('shows the activity while working, or a fallback', () => {
    expect(chipText({ status: 'working', activity: 'Drafting brief' })).toBe('Drafting brief');
    expect(chipText({ status: 'working' })).toBe('Working');
  });
  it('names the meeting room', () => {
    expect(chipText({ status: 'meeting', roomId: 'council' }, 'Council')).toBe('In Council');
    expect(chipText({ status: 'meeting' })).toBe('In a meeting');
  });
  it('covers idle, error, offline and no-bot', () => {
    expect(chipText({ status: 'idle' })).toBe('Idle');
    expect(chipText({ status: 'error', activity: 'Timeout' })).toBe('Error: Timeout');
    expect(chipText({ status: 'error' })).toBe('Error');
    expect(chipText({ status: 'offline' })).toBe('Offline');
    expect(chipText({ status: 'no-bot' })).toBe('No bot yet');
  });
  it('says what a bot that needs you is waiting on', () => {
    expect(chipText({ status: 'needs-input', activity: 'Wants to use Bash' })).toBe('Wants to use Bash');
    expect(chipText({ status: 'needs-input' })).toBe('Needs you');
  });
  it('truncates long activity text', () => {
    const text = chipText({ status: 'working', activity: 'x'.repeat(80) });
    expect(text.length).toBeLessThanOrEqual(34);
    expect(text.endsWith('…')).toBe(true);
  });
});

describe('fleetCounts', () => {
  it('counts statuses across the bots only', () => {
    const counts = fleetCounts([dwight, jim, { ...dwight, id: 'pam' }], { dwight: { status: 'working' }, pam: { status: 'error' } });
    expect(counts).toEqual({ working: 1, idle: 0, meeting: 0, offline: 0, error: 1, 'needs-input': 0, bots: 2, staff: 3 });
    expect(fleetCounts([dwight], { dwight: { status: 'needs-input' } })['needs-input']).toBe(1);
  });
});
