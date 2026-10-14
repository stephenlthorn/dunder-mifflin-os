import { describe, expect, it } from 'vitest';
import { KONAMI, konamiStep } from './konami';

const run = (keys: readonly string[]) => keys.reduce((s, k) => konamiStep(s.progress, k), { progress: 0, done: false });

describe('konamiStep', () => {
  it('fires after up up down down left right left right b a', () => {
    expect(run(KONAMI)).toEqual({ progress: 0, done: true });
    expect(run([...KONAMI.slice(0, 9), 'A'])).toMatchObject({ done: true });
  });

  it('starts over on a wrong key, but a stray up keeps the run alive', () => {
    expect(run(['ArrowUp', 'ArrowUp', 'x'])).toEqual({ progress: 0, done: false });
    expect(run(['ArrowUp', 'ArrowUp', 'ArrowUp', ...KONAMI.slice(2)])).toMatchObject({ done: true });
  });
});
