import { describe, expect, it } from 'vitest';
import { TWSS_GAP_MS, twssFor, twssMatch } from './twss';

describe('twssMatch', () => {
  it('hears the classic set-ups, any case, straight or curly apostrophes', () => {
    for (const s of ['That\'s too big to send in one go.', 'It was so hard to get it in', 'THAT’S WHAT I SAID, it’s too long', 'Can you make it longer?', 'go faster please', 'This one is really hard'])
      expect(twssMatch(s), s).toBe(true);
  });

  it('stays quiet otherwise', () => {
    for (const s of ['The board is big', 'Hardware order sent', 'Longer term goals', 'I am done', ''])
      expect(twssMatch(s), s).toBe(false);
  });
});

describe('twssFor (the toast)', () => {
  const msg = { id: 'm1', roomId: 'dm-sales', authorId: 'dwight', text: 'That file is way too big to email.', at: '2026-10-13T15:00:00.000Z' };
  it('quotes the real line and who said it', () => {
    expect(twssFor(msg, 'Dwight Schrute', null, 0)).toEqual({ text: 'That’s what she said!', sub: '“That file is way too big to email.” — Dwight Schrute' });
  });

  it('is capped: once every ten minutes', () => {
    expect(twssFor(msg, 'Dwight', 1000, 1000 + TWSS_GAP_MS - 1)).toBeNull();
    expect(twssFor(msg, 'Dwight', 1000, 1000 + TWSS_GAP_MS)).not.toBeNull();
    expect(twssFor({ ...msg, text: 'All done.' }, 'Dwight', null, 0)).toBeNull();
  });
});
