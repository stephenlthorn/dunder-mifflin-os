import { describe, expect, it } from 'vitest';
import {
  SESSION_COOKIE, isSignedIn, needsSecureCookie, readCookie, safeNext, sessionCookie, sessionValue, tokenMatches,
} from '../src/http/auth.ts';

const TOKEN = 'correct-horse-battery-staple-42';

describe('tokenMatches', () => {
  it('matches only the exact token', () => {
    expect(tokenMatches(TOKEN, TOKEN)).toBe(true);
    expect(tokenMatches(`${TOKEN} `, TOKEN)).toBe(false);
    expect(tokenMatches(TOKEN.slice(0, -1), TOKEN)).toBe(false);
    expect(tokenMatches('', TOKEN)).toBe(false);
    expect(tokenMatches(undefined, TOKEN)).toBe(false);
    expect(tokenMatches(42, TOKEN)).toBe(false);
    expect(tokenMatches('x'.repeat(5000), TOKEN)).toBe(false);
  });
});

describe('session cookie', () => {
  it('derives a session value from the token without containing it', () => {
    const value = sessionValue(TOKEN);
    expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(value).not.toContain(TOKEN);
    expect(sessionValue(TOKEN)).toBe(value);
    expect(sessionValue(`${TOKEN}x`)).not.toBe(value);
  });

  it('is HttpOnly, SameSite=Strict, Path=/, long-lived and Secure unless told otherwise', () => {
    const cookie = sessionCookie('v', true);
    expect(cookie).toMatch(new RegExp(`^${SESSION_COOKIE}=v;`));
    for (const part of ['HttpOnly', 'SameSite=Strict', 'Path=/', 'Max-Age=2592000', 'Secure']) expect(cookie).toContain(part);
    expect(sessionCookie('v', false)).not.toContain('Secure');
  });

  it('reads one cookie out of a Cookie header', () => {
    expect(readCookie(`a=1; ${SESSION_COOKIE}=abc; b=2`, SESSION_COOKIE)).toBe('abc');
    expect(readCookie('a=1', SESSION_COOKIE)).toBeNull();
    expect(readCookie(undefined, SESSION_COOKIE)).toBeNull();
    expect(readCookie(`x${SESSION_COOKIE}=nope`, SESSION_COOKIE)).toBeNull();
  });

  it('signs a request in only with the right session cookie', () => {
    const ok = { headers: { cookie: `${SESSION_COOKIE}=${sessionValue(TOKEN)}` } };
    expect(isSignedIn(ok, TOKEN)).toBe(true);
    expect(isSignedIn(ok, `${TOKEN}-rotated`)).toBe(false);
    expect(isSignedIn({ headers: { cookie: `${SESSION_COOKIE}=${TOKEN}` } }, TOKEN)).toBe(false);
    expect(isSignedIn({ headers: {} }, TOKEN)).toBe(false);
  });
});

describe('needsSecureCookie', () => {
  it('drops Secure only for plain loopback requests (Safari refuses Secure cookies on http://localhost)', () => {
    expect(needsSecureCookie({ headers: { host: '127.0.0.1:4318' } })).toBe(false);
    expect(needsSecureCookie({ headers: { host: 'localhost:4318' } })).toBe(false);
    expect(needsSecureCookie({ headers: { host: 'office-box.example-tailnet.ts.net' } })).toBe(true);
    expect(needsSecureCookie({ headers: { host: '127.0.0.1:4318', 'x-forwarded-for': '100.64.0.2' } })).toBe(true);
    expect(needsSecureCookie({ headers: { host: '127.0.0.1:4318', 'x-forwarded-proto': 'https' } })).toBe(true);
    expect(needsSecureCookie({ headers: { host: '127.0.0.1:4318', forwarded: 'for=1.2.3.4' } })).toBe(true);
    expect(needsSecureCookie({ headers: {} })).toBe(true);
  });
});

describe('safeNext', () => {
  it('keeps same-origin paths and drops anything that could leave the site', () => {
    expect(safeNext('/')).toBe('/');
    expect(safeNext('/?demo=1')).toBe('/?demo=1');
    expect(safeNext('/rooms/ops')).toBe('/rooms/ops');
    for (const bad of [undefined, null, '', 'https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '/login', '/a\nb', `/${'x'.repeat(600)}`]) {
      expect(safeNext(bad)).toBe('/');
    }
  });
});
