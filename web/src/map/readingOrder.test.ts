import { describe, expect, it } from 'vitest';
import { type MapTarget, flatOrder, moveFocus, readingRows } from './readingOrder';

const t = (key: string, x: number, y: number): MapTarget => ({ key, x, y });
// Two rows on screen: a (left) b (right) on top, c d e below. y jitter within a row is still one row.
const targets = [t('e', 300, 205), t('b', 200, 10), t('c', 0, 190), t('a', 50, 0), t('d', 150, 200)];
const rows = readingRows(targets, 40);

describe('readingRows', () => {
  it('reads top to bottom, then left to right within a row', () => {
    expect(rows.map((r) => r.map((x) => x.key))).toEqual([['a', 'b'], ['c', 'd', 'e']]);
    expect(flatOrder(rows)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('does not mutate its input', () => {
    const copy = targets.map((x) => ({ ...x }));
    readingRows(targets, 40);
    expect(targets).toEqual(copy);
  });
});

describe('moveFocus', () => {
  it('moves to the next and previous target in reading order, null past either end', () => {
    expect(moveFocus(rows, 'b', 'next')).toBe('c');
    expect(moveFocus(rows, 'c', 'prev')).toBe('b');
    expect(moveFocus(rows, 'e', 'next')).toBeNull();
    expect(moveFocus(rows, 'a', 'prev')).toBeNull();
  });

  it('moves up and down to the nearest target in the row above or below', () => {
    expect(moveFocus(rows, 'a', 'down')).toBe('c');
    expect(moveFocus(rows, 'b', 'down')).toBe('d');
    expect(moveFocus(rows, 'e', 'up')).toBe('b');
    expect(moveFocus(rows, 'a', 'up')).toBeNull();
  });

  it('jumps to the first or last; starts from the ends with no current target', () => {
    expect(moveFocus(rows, 'c', 'first')).toBe('a');
    expect(moveFocus(rows, 'c', 'last')).toBe('e');
    expect(moveFocus(rows, null, 'next')).toBe('a');
    expect(moveFocus(rows, 'gone', 'prev')).toBe('e');
    expect(moveFocus([], null, 'next')).toBeNull();
  });
});
