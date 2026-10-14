import { describe, expect, it } from 'vitest';
import { MIN_TOKEN_LENGTH, isLoopbackHost, isOn, parseBindHost, resolveAccess } from '../src/config.ts';

const TOKEN = 'a'.repeat(MIN_TOKEN_LENGTH);
const TAILNET = 'https://office-box.example-tailnet.ts.net:4318';

describe('parseBindHost (DMOS_HOST)', () => {
  it('defaults to 127.0.0.1', () => {
    expect(parseBindHost(undefined)).toBe('127.0.0.1');
    expect(parseBindHost('  ')).toBe('127.0.0.1');
  });

  it('accepts IP literals and localhost', () => {
    expect(parseBindHost('0.0.0.0')).toBe('0.0.0.0');
    expect(parseBindHost('::')).toBe('::');
    expect(parseBindHost(' ::1 ')).toBe('::1');
    expect(parseBindHost('localhost')).toBe('localhost');
  });

  it('rejects anything else', () => {
    for (const bad of ['example.com', 'http://0.0.0.0', '0.0.0.0:4318', '999.1.1.1']) {
      expect(() => parseBindHost(bad)).toThrow(/DMOS_HOST/);
    }
  });
});

describe('isLoopbackHost', () => {
  it('knows loopback from everything else', () => {
    for (const h of ['127.0.0.1', '127.0.0.2', '::1', 'localhost']) expect(isLoopbackHost(h)).toBe(true);
    for (const h of ['0.0.0.0', '::', '192.168.1.5', '10.0.0.1', '::ffff:7f00:1x']) expect(isLoopbackHost(h)).toBe(false);
  });
});

describe('isOn (DMOS_ALLOW_WRITES)', () => {
  it('is on only for explicit yes values', () => {
    for (const v of ['1', 'true', 'TRUE', 'yes', 'on']) expect(isOn(v)).toBe(true);
    for (const v of [undefined, '', '0', 'false', 'no', 'off', 'maybe']) expect(isOn(v)).toBe(false);
  });
});

describe('resolveAccess', () => {
  it('is open and token-free on loopback with no public origins', () => {
    expect(resolveAccess({ host: '127.0.0.1', publicOrigins: [], token: undefined })).toEqual({ remote: false, token: null });
    expect(resolveAccess({ host: '127.0.0.1', publicOrigins: [], token: '' })).toEqual({ remote: false, token: null });
  });

  it('requires a token when bound beyond loopback', () => {
    expect(() => resolveAccess({ host: '0.0.0.0', publicOrigins: [], token: undefined })).toThrow(/DMOS_ACCESS_TOKEN/);
    expect(resolveAccess({ host: '0.0.0.0', publicOrigins: [], token: TOKEN })).toEqual({ remote: true, token: TOKEN });
  });

  it('requires a token when published at a public origin, even on loopback', () => {
    expect(() => resolveAccess({ host: '127.0.0.1', publicOrigins: [TAILNET], token: undefined })).toThrow(/DMOS_ACCESS_TOKEN/);
    expect(resolveAccess({ host: '127.0.0.1', publicOrigins: [TAILNET], token: TOKEN })).toEqual({ remote: true, token: TOKEN });
  });

  it('uses a token set on a local server too', () => {
    expect(resolveAccess({ host: '127.0.0.1', publicOrigins: [], token: TOKEN })).toEqual({ remote: false, token: TOKEN });
  });

  it('refuses short tokens without echoing them', () => {
    const short = 'hunter2-secret';
    let message = '';
    try {
      resolveAccess({ host: '0.0.0.0', publicOrigins: [], token: short });
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(new RegExp(`at least ${MIN_TOKEN_LENGTH} characters`));
    expect(message).not.toContain(short);
  });
});
