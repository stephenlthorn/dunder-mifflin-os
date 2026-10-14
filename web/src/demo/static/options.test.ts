import { describe, expect, it } from 'vitest';
import { readStaticOptions } from './options';

describe('static demo options from the page address', () => {
  it('reads speed, start time and seed', () => {
    expect(readStaticOptions('?speed=10&at=10:25&seed=7')).toEqual({ speed: 10, start: 625, seed: 7 });
    expect(readStaticOptions('')).toEqual({});
  });

  it('ignores anything it cannot use, keeping the defaults', () => {
    expect(readStaticOptions('?speed=1000&at=midnight&seed=-4&x=1')).toEqual({});
    expect(readStaticOptions('?at=07:00')).toEqual({});
  });
});
