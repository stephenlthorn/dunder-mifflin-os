import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../src/http/rateLimit.ts';

describe('createRateLimiter (fixed window)', () => {
  it('allows N calls per window, then refuses until the window rolls over', () => {
    let t = 0;
    const limiter = createRateLimiter({ max: 2, windowMs: 1000, clock: () => t });
    expect([limiter.take(), limiter.take(), limiter.take()]).toEqual([true, true, false]);
    t = 1000;
    expect(limiter.take()).toBe(true);
  });
});
