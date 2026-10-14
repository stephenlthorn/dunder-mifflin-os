import { describe, expect, it } from 'vitest';
import { DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { buildPamItems } from './items';
import { parseQuery, searchPam } from './search';

const items = buildPamItems(DEMO_SNAPSHOT, { filter: 'all', view: 'map', writable: true });
const ids = (query: string, recents: string[] = []) => searchPam(items, query, recents).flatMap((s) => s.items.map((i) => i.id));

describe('parseQuery', () => {
  it('pulls out an s: status filter, matching a status by prefix', () => {
    expect(parseQuery('  Dwight  ')).toEqual({ tokens: ['dwight'] });
    expect(parseQuery('s:err sad')).toEqual({ tokens: ['sad'], status: 'error' });
    expect(parseQuery('s:needs')).toEqual({ tokens: [], status: 'needs-input' });
    expect(parseQuery('s:needs-you')).toEqual({ tokens: [], status: 'needs-input' });
    expect(parseQuery('s:party')).toEqual({ tokens: [], status: 'party' });
  });
});

describe('searchPam', () => {
  it('with no query, shows recent items then actions', () => {
    const sections = searchPam(items, '', ['room:ops', 'person:gone', 'person:dwight']);
    expect(sections.map((s) => s.id)).toEqual(['recent', 'actions']);
    expect(sections[0].items.map((i) => i.id)).toEqual(['room:ops', 'person:dwight']);
    expect(sections[1].items.every((i) => i.kind === 'action')).toBe(true);
    expect(searchPam(items, '  ', []).map((s) => s.id)).toEqual(['actions']);
  });

  it('finds a person first, then their chat', () => {
    expect(ids('dwi').slice(0, 2)).toEqual(['person:dwight', 'bot:dwight']);
    expect(ids('chat dw')[0]).toBe('bot:dwight');
  });

  it('searches rooms, tasks and jobs', () => {
    expect(ids('council')).toContain('room:council');
    expect(ids('q4 pricing')[0]).toBe('task:task-q4-pricing');
    expect(ids('backup')).toEqual([expect.stringMatching(/^job:sadiq:/)]);
    expect(ids('conference').slice(0, 3)).toContain('action:conference');
  });

  it('finds people by bot profile, role and status words', () => {
    expect(ids('campaigns')[0]).toBe('person:dwight');
    expect(ids('council advisor')).toContain('person:michael');
  });

  it('filters by status with s:', () => {
    expect(ids('s:error')).toEqual(['person:sadiq', 'bot:sadiq']);
    expect(ids('s:work kel')).toEqual(['person:kelly', 'bot:kelly']);
    expect(ids('s:party')).toEqual([]);
  });

  it('nudges recent items up among equal matches and caps the list', () => {
    expect(ids('room', ['room:skool'])[0]).toBe('room:skool');
    expect(searchPam(items, 'e', [], 6)[0].items).toHaveLength(6);
  });

  it('returns an empty results section when nothing matches', () => {
    expect(searchPam(items, 'zzzz', [])).toEqual([{ id: 'results', title: 'Results', items: [] }]);
  });
});
