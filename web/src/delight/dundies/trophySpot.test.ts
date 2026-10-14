import { describe, expect, it } from 'vitest';
import { FURNITURE, SEATS, STAFF } from '@shared/office';
import { trophySpot } from './trophySpot';

const SURFACES = new Set(['desk', 'reception-desk', 'table', 'round-table', 'coffee-table', 'it-cart', 'ledge']);

describe('trophySpot', () => {
  it('stands every bot\'s Dundie on a desk or table near them', () => {
    for (const s of STAFF.filter((p) => p.bot)) {
      const seat = SEATS.find((x) => x.id === s.seatId)!;
      const at = trophySpot(seat);
      const on = FURNITURE.filter((f) => SURFACES.has(f.kind) && at.x >= f.x && at.x <= f.x + f.w && at.y >= f.y && at.y <= f.y + f.d);
      expect(on.map((f) => f.id), `${s.id} at ${at.x.toFixed(1)},${at.y.toFixed(1)}`).not.toEqual([]);
    }
  });
});
