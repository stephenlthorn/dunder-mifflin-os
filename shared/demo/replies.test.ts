import { describe, expect, it } from 'vitest';
import { DEMO_CAST } from './cast';
import { FALLBACK_REPLY, REPLIES } from './lines';
import { cannedReply } from './replies';

describe('canned replies', () => {
  it('answers in the bot\'s own voice, the same way for the same seed and message number', () => {
    expect(REPLIES.sales).toContain(cannedReply('sales', 0, 1));
    expect(cannedReply('sales', 3, 9)).toBe(cannedReply('sales', 3, 9));
  });

  it('varies the reply from one message to the next', () => {
    const replies = new Set(Array.from({ length: 8 }, (_, n) => cannedReply('frontdesk', n, 1)));
    expect(replies.size).toBeGreaterThan(1);
  });

  it('has lines for every bot in the cast, and a fallback for anyone else', () => {
    for (const c of DEMO_CAST) expect(REPLIES[c.agent]?.length, c.agent).toBeGreaterThan(1);
    expect(cannedReply('nobody', 0, 1)).toBe(FALLBACK_REPLY);
  });
});
