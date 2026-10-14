// How the demo is switched on: DMOS_SOURCE=demo (the CLI's --demo, npm run demo, Docker), the config file, the CLI.
import { DEMO_BUDGETS } from '../src/adapters/demo/usage.ts';
import { describe, expect, it } from 'vitest';
import { parseOfficeConfig } from '../src/officeConfig.ts';
import { createAdapters } from '../src/adapters/factory.ts';
import { demoSettingsFromEnv } from '../src/adapters/demo/options.ts';
import { isDemoAdapter } from '../src/adapters/demo/adapter.ts';
import { demoStartup, seatDefaults } from '../src/demoMode.ts';
import { resolveAccess } from '../src/config.ts';
import { parseCliArgs } from '../src/cli/args.ts';
import { banner, } from '../src/cli/startup.ts';
import { browserUrl, serverEnv } from '../src/cli/env.ts';
import { DEFAULT_SEATS } from '../src/roster.ts';
import type { Runner } from '../src/chat/runner.ts';

const noRunner: Runner = async () => { throw new Error('no commands in tests'); };
const deps = (env: Record<string, string>) => ({ env, runner: noRunner, hermesHome: '/nonexistent', hermesBin: '/nonexistent', statusUrl: null });

describe('demo settings', () => {
  it('reads speed, start and seed from the config file, validated', () => {
    expect(parseOfficeConfig({ adapters: [{ kind: 'demo', speed: 10, start: '10:25', seed: 3 }] }, 'x').adapters)
      .toEqual([{ kind: 'demo', id: 'demo', demo: { speed: 10, start: 625, seed: 3 } }]);
    expect(parseOfficeConfig({ adapters: ['demo'] }, 'x').adapters).toEqual([{ kind: 'demo', id: 'demo' }]);
    expect(() => parseOfficeConfig({ adapters: [{ kind: 'demo', speed: 5 }] }, 'c.yaml')).toThrow(/c\.yaml: adapters\[0\]\.speed: 1, 10 or 60/);
    expect(() => parseOfficeConfig({ adapters: [{ kind: 'demo', start: '07:00' }] }, 'c')).toThrow(/adapters\[0\]\.start/);
    expect(() => parseOfficeConfig({ adapters: [{ kind: 'webhook', speed: 10 }] }, 'c')).toThrow(/adapters\[0\]: unknown field "speed"/);
  });

  it('reads them from DMOS_DEMO_SPEED / _START / _SEED, refusing bad values by name', () => {
    expect(demoSettingsFromEnv({ DMOS_DEMO_SPEED: '10', DMOS_DEMO_START: '11:50', DMOS_DEMO_SEED: '7' })).toEqual({ speed: 10, start: 710, seed: 7 });
    expect(demoSettingsFromEnv({})).toEqual({});
    expect(() => demoSettingsFromEnv({ DMOS_DEMO_SPEED: 'warp' })).toThrow(/DMOS_DEMO_SPEED/);
    expect(() => demoSettingsFromEnv({ DMOS_DEMO_START: '3am' })).toThrow(/DMOS_DEMO_START/);
  });

  it('builds a demo adapter from a spec', async () => {
    const [adapter] = createAdapters([{ kind: 'demo', id: 'tlm', demo: { speed: 1, start: 600 } }], deps({}));
    expect(adapter && isDemoAdapter(adapter)).toBe(true);
    expect(adapter?.id).toBe('tlm');
    expect((adapter as never as { demo: { clock(): { speed: number } } }).demo.clock().speed).toBe(1);
    await adapter?.close?.();
  });
});

describe('DMOS_SOURCE=demo', () => {
  it('runs the demo alone, ignoring the config file, with writes on (in memory) and no photos', () => {
    expect(demoStartup({ DMOS_SOURCE: 'demo', DMOS_DEMO_SPEED: '10' })).toEqual({
      config: { file: null, adapters: [{ kind: 'demo', id: 'demo', demo: { speed: 10 } }], seats: {}, budgets: DEMO_BUDGETS }, allowWrites: true,
    });
    expect(demoStartup({ DMOS_SOURCE: 'demo', DMOS_ALLOW_WRITES: '0' })?.allowWrites).toBe(false);
    expect(demoStartup({ DMOS_SOURCE: 'fixture' })).toBeNull();
    expect(demoStartup({})).toBeNull();
  });

  it('seats demo bots at their characters over the built-in Hermes seating', () => {
    expect(seatDefaults([{ kind: 'hermes', id: 'hermes' }])).toEqual(DEFAULT_SEATS);
    expect(seatDefaults([{ kind: 'demo', id: 'demo' }])).toMatchObject({ pam: { adapter: 'demo', agent: 'frontdesk' }, kevin: { adapter: 'demo', agent: 'imports' } });
  });

  it('needs no access token beyond loopback: it only serves fiction', () => {
    expect(resolveAccess({ host: '0.0.0.0', publicOrigins: [], token: undefined, demoOnly: true })).toEqual({ remote: true, token: null });
    expect(() => resolveAccess({ host: '0.0.0.0', publicOrigins: [], token: undefined, demoOnly: false })).toThrow(/DMOS_ACCESS_TOKEN/);
    expect(resolveAccess({ host: '0.0.0.0', publicOrigins: [], token: 'a'.repeat(16), demoOnly: true }).token).toBe('a'.repeat(16));
  });
});

describe('npx dunder-mifflin-os --demo', () => {
  const run = (argv: string[]) => {
    const cmd = parseCliArgs(argv);
    if (cmd.kind !== 'run') throw new Error(`expected run, got ${cmd.kind}`);
    return cmd.options;
  };
  const ctx = { home: '/home/pat', webDist: '/pkg/web/dist' };

  it('starts the demo day (at a chosen speed) and opens the office itself, not the old ?demo=1 page', () => {
    expect(run(['--demo', '--speed', '10'])).toMatchObject({ demo: true, speed: 10 });
    expect(parseCliArgs(['--speed', '5']).kind).toBe('error');
    expect(parseCliArgs(['--speed', '10']).kind).toBe('error'); // only with --demo
    const env = serverEnv(run(['--demo', '--speed', '10']), {}, ctx);
    expect(env).toMatchObject({ DMOS_SOURCE: 'demo', DMOS_DEMO_SPEED: '10' });
    expect(browserUrl(env)).toBe('http://127.0.0.1:4318/');
  });

  it('says it is the demo day and that writes stay in memory', () => {
    const text = banner({ DMOS_SOURCE: 'demo' }, 'http://127.0.0.1:4318/', '/home/pat');
    expect(text).toContain('Threat Level Midnight');
    expect(text).toMatch(/Writes:\s+on, in memory only/);
    expect(text).not.toContain('.hermes');
  });
});
