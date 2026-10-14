import { describe, expect, it } from 'vitest';
import { parseOfficeConfig } from '../src/officeConfig.ts';
import { parsePrices } from '../src/usage/configPrices.ts';

describe('prices: in config.yaml', () => {
  it('adds or corrects model prices (USD per million tokens) with an optional date', () => {
    const config = parseOfficeConfig({
      prices: { asOf: '2026-11-01', models: { 'MiniMax-M3.1-Flash-Preview': { input: 0.3, output: 1.2, cacheRead: 0.06 }, 'local/qwen': { input: 0, output: 0 } } },
    }, 'config.yaml');
    expect(config.prices).toEqual({
      asOf: '2026-11-01', models: { 'MiniMax-M3.1-Flash-Preview': { input: 0.3, output: 1.2, cacheRead: 0.06 }, 'local/qwen': { input: 0, output: 0 } },
    });
    expect(parseOfficeConfig({}, 'x')).not.toHaveProperty('prices');
  });

  it('refuses mistakes with a message naming the field', () => {
    const cases: Array<[unknown, RegExp]> = [
      ['cheap', /prices: expected/],
      [{ models: [] }, /prices\.models/],
      [{ asOf: 'last week', models: {} }, /prices\.asOf/],
      [{ models: { x: { input: -1, output: 1 } } }, /prices\.models\.x\.input/],
      [{ models: { x: { input: 1 } } }, /prices\.models\.x\.output/],
      [{ models: { x: { input: 1, output: 2, cached: 3 } } }, /prices\.models\.x.*cached/],
      [{ models: { 'bad name!': { input: 1, output: 2 } } }, /prices\.models/],
      [{ currency: 'EUR', models: {} }, /prices.*currency/],
    ];
    for (const [raw, message] of cases) {
      const parsed = parsePrices(raw);
      expect(parsed.ok, JSON.stringify(raw)).toBe(false);
      if (!parsed.ok) expect(parsed.error).toMatch(message);
    }
    expect(() => parseOfficeConfig({ prices: { models: { x: { input: 'free' } } } }, '/home/me/config.yaml')).toThrow(/config\.yaml: prices\.models\.x\.input/);
  });
});
