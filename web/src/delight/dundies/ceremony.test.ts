import { describe, expect, it } from 'vitest';
import { ceremonyDue, weekKey } from './ceremony';

// local times, so the tests read the same in any time zone
const fri = (h: number, m = 0) => new Date(2026, 9, 16, h, m);

describe('the Friday-evening ceremony', () => {
  it('is due on Friday from 17:00 until midnight, once a week', () => {
    expect(ceremonyDue(fri(16, 59), null)).toBe(false);
    expect(ceremonyDue(fri(17, 0), null)).toBe(true);
    expect(ceremonyDue(fri(23, 59), null)).toBe(true);
    expect(ceremonyDue(fri(18), weekKey(fri(9)))).toBe(false); // already seen this week
    expect(ceremonyDue(fri(18), weekKey(new Date(2026, 9, 9, 18)))).toBe(true); // last week's doesn't count
    expect(ceremonyDue(new Date(2026, 9, 15, 18), null)).toBe(false); // Thursday
    expect(ceremonyDue(new Date(2026, 9, 17, 18), null)).toBe(false); // Saturday
  });

  it('names a week by its Monday', () => {
    expect(weekKey(fri(18))).toBe('2026-10-12');
    expect(weekKey(new Date(2026, 9, 12, 0, 1))).toBe('2026-10-12');
    expect(weekKey(new Date(2026, 9, 18, 23))).toBe('2026-10-12'); // Sunday belongs to the week before
  });
});
