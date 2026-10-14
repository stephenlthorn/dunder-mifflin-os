import { describe, expect, it } from 'vitest';
import { bearerAuthorizer, readIngestToken } from '../../src/adapters/ingest/auth.ts';
import { pushRing } from '../../src/adapters/ingest/ring.ts';
import { createKeyedLimiter } from '../../src/adapters/ingest/keyedLimiter.ts';

const TOKEN = 'a-long-enough-test-token-1234';

describe('readIngestToken (DMOS_INGEST_TOKEN)', () => {
  it('requires a token of at least 24 characters, trimmed', () => {
    expect(readIngestToken(`  ${TOKEN}\n`)).toBe(TOKEN);
    for (const bad of [undefined, '', '   ', 'short-token']) expect(() => readIngestToken(bad)).toThrow(/DMOS_INGEST_TOKEN/);
  });

  it('never echoes the token in its error', () => {
    expect(() => readIngestToken('tiny-secret')).toThrow(expect.objectContaining({ message: expect.not.stringContaining('tiny-secret') }));
  });
});

describe('bearerAuthorizer', () => {
  const ok = bearerAuthorizer(TOKEN);

  it('accepts exactly "Bearer <token>" (scheme case-insensitive)', () => {
    expect(ok({ authorization: `Bearer ${TOKEN}` })).toBe(true);
    expect(ok({ authorization: `bearer ${TOKEN}` })).toBe(true);
  });

  it('refuses a missing, wrong, longer, shorter or differently-schemed credential', () => {
    for (const authorization of [undefined, '', TOKEN, `Bearer ${TOKEN}x`, `Bearer ${TOKEN.slice(1)}`, `Basic ${TOKEN}`, `Bearer  ${TOKEN}`, 'Bearer ']) {
      expect(ok({ authorization }), String(authorization)).toBe(false);
    }
  });
});

describe('pushRing', () => {
  it('appends without touching the original and keeps only the newest items', () => {
    const one = pushRing([], 'a', 2);
    const two = pushRing(one, 'b', 2);
    const three = pushRing(two, 'c', 2);
    expect([one, two, three]).toEqual([['a'], ['a', 'b'], ['b', 'c']]);
    expect(Object.isFrozen(three)).toBe(true);
  });
});

describe('createKeyedLimiter', () => {
  it('counts per key in a fixed window and resets when the window passes', () => {
    let t = 0;
    const limiter = createKeyedLimiter({ max: 2, windowMs: 1000, clock: () => t });
    expect([limiter.take('a'), limiter.take('a'), limiter.take('a'), limiter.take('b')]).toEqual([true, true, false, true]);
    t = 1000;
    expect(limiter.take('a')).toBe(true);
  });

  it('forgets idle keys so it cannot grow without bound', () => {
    let t = 0;
    const limiter = createKeyedLimiter({ max: 1, windowMs: 1000, clock: () => t });
    for (let i = 0; i < 100; i += 1) limiter.take(`k${i}`);
    t = 5000;
    limiter.take('fresh');
    expect(limiter.size()).toBe(1);
  });
});
