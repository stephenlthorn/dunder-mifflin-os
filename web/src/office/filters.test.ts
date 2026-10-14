import { describe, expect, it } from 'vitest';
import type { OfficeSnapshot } from '@shared/contract';
import { DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { filterCounts, hiddenByFilter, matchesFilter, needsYou } from './filters';

const withPresence = (patch: OfficeSnapshot['presence']): OfficeSnapshot => ({ ...DEMO_SNAPSHOT, presence: { ...DEMO_SNAPSHOT.presence, ...patch } });
const person = (id: string) => DEMO_SNAPSHOT.people.find((p) => p.id === id)!;

describe('fleet filters', () => {
  it('needs-you is the needs-input status', () => {
    expect(needsYou({ status: 'working' })).toBe(false);
    expect(needsYou({ status: 'needs-input' })).toBe(true);
  });

  it('matches working, error and needs-you bots; "all" matches everyone', () => {
    expect(matchesFilter(person('dwight'), { status: 'working' }, 'working')).toBe(true);
    expect(matchesFilter(person('dwight'), { status: 'meeting' }, 'working')).toBe(false);
    expect(matchesFilter(person('sadiq'), { status: 'error' }, 'error')).toBe(true);
    expect(matchesFilter(person('pam'), { status: 'needs-input' }, 'needs-you')).toBe(true);
    expect(matchesFilter(person('jim'), { status: 'no-bot' }, 'all')).toBe(true);
    expect(matchesFilter(person('jim'), { status: 'no-bot' }, 'working')).toBe(false);
  });

  it('lists who a filter hides (nobody for "all")', () => {
    expect(hiddenByFilter(DEMO_SNAPSHOT, 'all').size).toBe(0);
    const hidden = hiddenByFilter(DEMO_SNAPSHOT, 'error');
    expect(hidden.has('sadiq')).toBe(false);
    expect(hidden.size).toBe(22);
  });

  it('counts each filter', () => {
    expect(filterCounts(DEMO_SNAPSHOT)).toEqual({ working: 5, 'needs-you': 0, error: 1 });
    expect(filterCounts(withPresence({ kelly: { status: 'needs-input' } }))['needs-you']).toBe(1);
  });
});
