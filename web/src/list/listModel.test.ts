import { describe, expect, it } from 'vitest';
import type { OfficeSnapshot } from '@shared/contract';
import { DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { listGroups } from './listModel';

const groups = listGroups(DEMO_SNAPSHOT, 'all');
const group = (id: string, list = groups) => list.find((g) => g.areaId === id)!;
const names = (id: string, list = groups) => group(id, list).rows.map((r) => r.person.id);

describe('mobile list groups', () => {
  it('groups everyone by where they are now, Reception first, then the Bullpen', () => {
    expect(groups.slice(0, 2).map((g) => g.name)).toEqual(['Reception', 'Bullpen']);
    expect(groups.reduce((n, g) => n + g.rows.length, 0)).toBe(23);
  });

  it('puts people in a meeting under the room they are in', () => {
    expect(names('conference')).toEqual(expect.arrayContaining(['michael', 'angela']));
    expect(group('conference').rows.find((r) => r.person.id === 'michael')!.where).toBe('In Council');
    expect(group('conference').rooms.map((r) => r.id)).toEqual(['ops', 'council']);
  });

  it('sorts errors and busy bots above idle ones and people without bots', () => {
    const reception = names('reception');
    expect(reception[0]).toBe('sadiq'); // error
    expect(reception.indexOf('pam')).toBeLessThan(reception.indexOf('erin'));
  });

  it('keeps a room area with nobody in it (the Break Room hosts Skool)', () => {
    expect(group('breakroom').rows).toEqual([]);
    expect(group('breakroom').rooms.map((r) => r.id)).toEqual(['skool']);
  });

  it('applies the fleet filter and drops empty groups', () => {
    const errors = listGroups(DEMO_SNAPSHOT, 'error');
    expect(errors.map((g) => g.areaId)).toEqual(['reception']);
    expect(names('reception', errors)).toEqual(['sadiq']);
  });

  it('lifts bots that need you above errors', () => {
    const snap: OfficeSnapshot = { ...DEMO_SNAPSHOT, presence: { ...DEMO_SNAPSHOT.presence, jarvis: { status: 'needs-input' } } };
    const rows = group('reception', listGroups(snap, 'all')).rows;
    expect(rows.map((r) => r.person.id).slice(0, 2)).toEqual(['jarvis', 'sadiq']);
    expect(group('reception', listGroups(snap, 'needs-you')).rows.map((r) => r.person.id)).toEqual(['jarvis']);
  });
});
