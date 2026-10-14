import { describe, expect, it } from 'vitest';
import { HELP_TEXT, parseCliArgs } from '../src/cli/args.ts';
import { browserUrl, expandHome, openCommand, serverEnv } from '../src/cli/env.ts';
import { banner, webBuildState } from '../src/cli/startup.ts';

const HOME = '/home/pat';
const CTX = { home: HOME, webDist: '/pkg/web/dist' };
const run = (argv: string[]) => {
  const cmd = parseCliArgs(argv);
  if (cmd.kind !== 'run') throw new Error(`expected run, got ${cmd.kind}`);
  return cmd.options;
};

describe('parseCliArgs', () => {
  it('defaults to a live, read-only office without opening a browser', () => {
    expect(run([])).toEqual({ demo: false, open: false, allowWrites: false });
  });

  it('reads every flag', () => {
    expect(run(['--demo', '--open', '--allow-writes', '--port', '4400', '--hermes-home', '~/h', '--portraits', '/p'])).toEqual({
      demo: true, open: true, allowWrites: true, port: 4400, hermesHome: '~/h', portraits: '/p',
    });
    expect(run(['--port=4401']).port).toBe(4401);
  });

  it('answers help and version', () => {
    expect(parseCliArgs(['--help']).kind).toBe('help');
    expect(parseCliArgs(['-h']).kind).toBe('help');
    expect(parseCliArgs(['--version']).kind).toBe('version');
    for (const flag of ['--demo', '--speed', '--open', '--allow-writes', '--port', '--hermes-home', '--portraits']) expect(HELP_TEXT).toContain(flag);
  });

  it('rejects bad ports, unknown flags, empty paths and stray arguments', () => {
    for (const argv of [['--port', '80'], ['--port', 'abc'], ['--port', '70000'], ['--nope'], ['--hermes-home', ' '], ['serve']]) {
      const cmd = parseCliArgs(argv);
      expect(cmd.kind, argv.join(' ')).toBe('error');
    }
  });
});

describe('serverEnv', () => {
  it('serves the built app and keeps the environment it was given', () => {
    const env = serverEnv(run([]), { DMOS_PORT: '4500', HERMES_HOME: '/srv/hermes', OTHER: 'x' }, CTX);
    expect(env).toMatchObject({ DMOS_SERVE_WEB: '1', DMOS_WEB_DIST: '/pkg/web/dist', DMOS_PORT: '4500', HERMES_HOME: '/srv/hermes', OTHER: 'x' });
    expect(env.DMOS_SOURCE).toBeUndefined();
    expect(env.DMOS_ALLOW_WRITES).toBeUndefined();
  });

  it('lets flags win over the environment, expanding ~', () => {
    const env = serverEnv(run(['--demo', '--allow-writes', '--port', '4600', '--hermes-home', '~/hermes', '--portraits', '~/faces']), { DMOS_PORT: '4500' }, CTX);
    expect(env).toMatchObject({
      DMOS_SOURCE: 'demo', DMOS_ALLOW_WRITES: '1', DMOS_PORT: '4600', HERMES_HOME: '/home/pat/hermes', DMOS_PORTRAITS_DIR: '/home/pat/faces',
    });
  });

  it('does not change the object it was given', () => {
    const base = Object.freeze({ DMOS_PORT: '4500' });
    serverEnv(run(['--port', '4600']), base, CTX);
    expect(base).toEqual({ DMOS_PORT: '4500' });
  });
});

describe('expandHome', () => {
  it('expands a leading ~ only', () => {
    expect(expandHome('~', HOME)).toBe(HOME);
    expect(expandHome('~/x', HOME)).toBe('/home/pat/x');
    expect(expandHome('/a/~/b', HOME)).toBe('/a/~/b');
  });
});

describe('browserUrl', () => {
  it('points at loopback; the demo day is the office itself (no ?demo=1)', () => {
    expect(browserUrl({})).toBe('http://127.0.0.1:4318/');
    expect(browserUrl({ DMOS_PORT: '4600', DMOS_HOST: '0.0.0.0' })).toBe('http://127.0.0.1:4600/');
    expect(browserUrl({ DMOS_HOST: '::' })).toBe('http://127.0.0.1:4318/');
    expect(browserUrl({ DMOS_SOURCE: 'demo' })).toBe('http://127.0.0.1:4318/');
  });
});

describe('openCommand', () => {
  it('uses the platform opener without a shell', () => {
    expect(openCommand('darwin', 'http://127.0.0.1:4318/')).toEqual({ file: 'open', args: ['http://127.0.0.1:4318/'] });
    expect(openCommand('linux', 'http://127.0.0.1:4318/')).toEqual({ file: 'xdg-open', args: ['http://127.0.0.1:4318/'] });
    expect(openCommand('win32', 'http://127.0.0.1:4318/')).toEqual({ file: 'cmd', args: ['/c', 'start', '""', 'http://127.0.0.1:4318/'] });
    expect(openCommand('aix', 'http://127.0.0.1:4318/')).toBeNull();
  });
});

describe('banner', () => {
  const TOKEN = 'banner-token-0123456789abcdef';
  it('says where the office is, what data it shows and that it is read-only', () => {
    const text = banner({ HERMES_HOME: '/home/pat/.hermes' }, 'http://127.0.0.1:4318/', HOME);
    expect(text).toContain('http://127.0.0.1:4318/');
    expect(text).toContain('live, from ~/.hermes');
    expect(text).toContain('read-only');
    expect(text).toContain('--allow-writes');
    expect(text).not.toContain('Sign-in');
  });

  it('describes the demo, writes and sign-in without ever printing the token', () => {
    const text = banner({ DMOS_SOURCE: 'fixture', DMOS_ALLOW_WRITES: '1', DMOS_ACCESS_TOKEN: TOKEN }, 'http://127.0.0.1:4318/', HOME);
    expect(text).toContain('recorded sample');
    expect(text).toContain('on: chat and task creation');
    expect(text).toContain('Sign-in: required');
    expect(text).not.toContain(TOKEN);
  });
});

describe('webBuildState', () => {
  const tree = (files: string[]) => (p: string) => files.some((f) => p.endsWith(f));
  it('is ready when the built app is there, buildable in a checkout, missing otherwise', () => {
    expect(webBuildState('/r', tree(['web/dist/index.html']))).toBe('ready');
    expect(webBuildState('/r', tree(['web/src/main.tsx', 'node_modules/vite/package.json']))).toBe('build');
    expect(webBuildState('/r', tree(['web/src/main.tsx']))).toBe('missing');
    expect(webBuildState('/r', tree([]))).toBe('missing');
  });
});
