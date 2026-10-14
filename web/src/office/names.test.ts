import { describe, expect, it } from 'vitest';
import { shortName } from './names';

describe('shortName', () => {
  it('is the first name', () => {
    expect(shortName('Dwight Schrute')).toBe('Dwight');
    expect(shortName('Sadiq')).toBe('Sadiq');
    expect(shortName('J.A.R.V.I.S.')).toBe('J.A.R.V.I.S.');
  });

  it('keeps a title with the name it belongs to', () => {
    expect(shortName('Sensei Ira')).toBe('Sensei Ira');
    expect(shortName('Dr. Schrute')).toBe('Dr. Schrute');
  });
});
