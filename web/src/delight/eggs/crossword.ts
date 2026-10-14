// Stanley's crossword comes out at 15:00 for half an hour; its answer is a real number (the cards the bots finished
// today). On Pretzel Day (19 October, "Initiation") the bots that finished a card get a free pretzel. Local time.
import type { OfficeSnapshot } from '@shared/contract';
import { shortName } from '../../office/names';

const ONES = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN',
  'FOURTEEN', 'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
const PRETZEL_DAY = { month: 9, day: 19 }; // 19 October (months count from 0)

export const crosswordTime = (d: Date): boolean => d.getHours() === 15 && d.getMinutes() < 30;
export const isPretzelDay = (d: Date): boolean => d.getMonth() === PRETZEL_DAY.month && d.getDate() === PRETZEL_DAY.day;

/** A crossword answer for a count (no spaces or hyphens, as in a grid). */
export function numberWord(n: number): string {
  if (n < 20) return ONES[n] ?? String(n);
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? ONES[n % 10] : ''}`;
  return String(n);
}

const sameDay = (iso: string, d: Date) => {
  const t = new Date(iso);
  return t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth() && t.getDate() === d.getDate();
};

function doneToday(s: OfficeSnapshot, d: Date) {
  return s.tasks.filter((t) => t.status === 'done' && sameDay(t.updatedAt, d));
}

export function crosswordClue(s: OfficeSnapshot, d: Date): { clue: string; answer: string } {
  const answer = numberWord(doneToday(s, d).length);
  return { clue: `7 across: cards the bots finished today (${answer.length})`, answer };
}

export function pretzelLine(s: OfficeSnapshot, d: Date): string {
  const ids = [...new Set(doneToday(s, d).flatMap((t) => (t.ownerId ? [t.ownerId] : [])))];
  const names = ids.flatMap((id) => s.people.filter((p) => p.id === id && p.bot).map((p) => shortName(p.name)));
  if (!names.length) return 'Pretzel Day! No bot has finished a card yet today, so the pretzels are still up for grabs.';
  return `Pretzel Day! Free pretzels for the ${names.length} bot${names.length === 1 ? ' who' : 's who'} finished a card today: ${names.join(', ')}.`;
}
