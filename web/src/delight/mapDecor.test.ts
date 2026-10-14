import { describe, expect, it } from 'vitest';
import type { ChipInfo } from '../map/Overlay';
import type { Occupant } from '../map/SeatView';
import { DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { decorateChips, decorateOccupants } from './mapDecor';

const chip = (personId: string, text: string, status: ChipInfo['status']): ChipInfo =>
  ({ personId, x: 0, y: 0, name: personId, text, status, figure: { x: 0, y: 0, w: 1, h: 1 } });

describe('decorateChips', () => {
  const chips = [chip('andy', 'Idle', 'idle'), chip('creed', 'No bot yet', 'no-bot'), chip('dwight', 'Working', 'working')];

  it('says where an idle bot went, and what Creed knows', () => {
    const out = decorateChips(chips, new Map([['andy', 'coffee']]), { count: 3, toby: false });
    expect(out.map((c) => c.text)).toEqual(['Idle · getting coffee', 'Knows something (3)', 'Working']);
    expect(decorateChips(chips, new Map(), { count: 2, toby: true })[1]?.text).toBe('2 unattributed');
  });

  it('changes nothing when there is nothing to say', () => {
    expect(decorateChips(chips, new Map(), { count: 0, toby: false })).toBe(chips);
  });
});

describe('decorateOccupants', () => {
  const creed = DEMO_SNAPSHOT.people.find((p) => p.id === 'creed')!;
  const occ: Occupant = { person: creed, presence: { status: 'no-bot' }, label: 'Creed Bratton — no bot yet', away: false, walking: false };
  it('adds Creed\'s corner to his label', () => {
    const out = decorateOccupants(new Map([['seat.creed', occ]]), { count: 3, toby: false });
    expect(out.get('seat.creed')?.label).toBe('Creed Bratton — no bot yet — Creed’s corner: 3 things nobody can explain');
    expect(decorateOccupants(new Map([['seat.creed', occ]]), { count: 0, toby: false }).get('seat.creed')?.label).toBe('Creed Bratton — no bot yet');
  });
});
