import { describe, expect, it } from 'vitest';
import { DEMO_OFFICE } from '@shared/fixtures/demo-approvals';
import { crosswordClue, crosswordTime, isPretzelDay, numberWord, pretzelLine } from './crossword';

describe('Stanley\'s crossword', () => {
  it('comes out at 15:00 for half an hour', () => {
    expect(crosswordTime(new Date(2026, 9, 13, 14, 59))).toBe(false);
    expect(crosswordTime(new Date(2026, 9, 13, 15, 0))).toBe(true);
    expect(crosswordTime(new Date(2026, 9, 13, 15, 29))).toBe(true);
    expect(crosswordTime(new Date(2026, 9, 13, 15, 30))).toBe(false);
  });

  it('has the number of cards the bots finished today as an answer', () => {
    const today = new Date(DEMO_OFFICE.generatedAt);
    const clue = crosswordClue(DEMO_OFFICE, today);
    expect(clue).toEqual({ clue: '7 across: cards the bots finished today (3)', answer: 'ONE' });
    expect(numberWord(0)).toBe('ZERO');
    expect(numberWord(12)).toBe('TWELVE');
    expect(numberWord(42)).toBe('FORTYTWO');
  });
});

describe('Pretzel Day', () => {
  it('is one day a year (19 October)', () => {
    expect(isPretzelDay(new Date(2026, 9, 19, 9))).toBe(true);
    expect(isPretzelDay(new Date(2026, 9, 18, 23, 59))).toBe(false);
  });

  it('hands a pretzel to every bot that finished a card today', () => {
    expect(pretzelLine(DEMO_OFFICE, new Date(DEMO_OFFICE.generatedAt))).toBe('Pretzel Day! Free pretzels for the 1 bot who finished a card today: Pam.');
  });
});
