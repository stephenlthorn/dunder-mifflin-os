import { afterAll, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadOfficeConfig, parseOfficeConfig } from '../src/officeConfig.ts';
import { createAdapters } from '../src/adapters/factory.ts';
import type { Runner } from '../src/chat/runner.ts';

const root = mkdtempSync(path.join(tmpdir(), 'dmos-config-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const homeWith = (name: string, file: string, text: string): string => {
  const home = path.join(root, name);
  mkdirSync(path.join(home, '.dunder-mifflin-os'), { recursive: true });
  writeFileSync(path.join(home, '.dunder-mifflin-os', file), text);
  return home;
};

describe('parseOfficeConfig', () => {
  it('defaults to Hermes alone with the built-in seating', () => {
    expect(parseOfficeConfig({}, 'x')).toEqual({ adapters: [{ kind: 'hermes', id: 'hermes' }], seats: {} });
    expect(parseOfficeConfig(null, 'x')).toEqual({ adapters: [{ kind: 'hermes', id: 'hermes' }], seats: {} });
  });

  it('reads adapters (short or long form) and seats', () => {
    const config = parseOfficeConfig({
      adapters: ['hermes', { kind: 'webhook' }, { kind: 'claude-code', id: 'cc' }, { kind: 'webhook', id: 'ci' }],
      seats: { jim: { adapter: 'cc', agent: 'paper-site', role: 'Pair programmer' }, pam: null },
    }, 'config.yaml');
    expect(config.adapters).toEqual([{ kind: 'hermes', id: 'hermes' }, { kind: 'webhook', id: 'webhook' }, { kind: 'claude-code', id: 'cc' }, { kind: 'webhook', id: 'ci' }]);
    expect(config.seats).toEqual({ jim: { adapter: 'cc', agent: 'paper-site', role: 'Pair programmer' }, pam: null });
  });

  it('lets the Hermes adapter read the recorded fixture instead of ~/.hermes', () => {
    expect(parseOfficeConfig({ adapters: [{ kind: 'hermes', source: 'fixture' }] }, 'x').adapters).toEqual([{ kind: 'hermes', id: 'hermes', source: 'fixture' }]);
  });

  it('lets a claude-code adapter hold permission requests for a decision in the office (opt-in)', () => {
    const config = parseOfficeConfig({ adapters: [{ kind: 'claude-code', decide: true }, { kind: 'claude-code', id: 'cc2', decide: true, holdSeconds: 60 }] }, 'c.yaml');
    expect(config.adapters).toEqual([{ kind: 'claude-code', id: 'claude-code', decide: true }, { kind: 'claude-code', id: 'cc2', decide: true, holdSeconds: 60 }]);
    expect(() => parseOfficeConfig({ adapters: [{ kind: 'webhook', decide: true }] }, 'c.yaml')).toThrow(/adapters\[0\]\.decide: only a claude-code adapter/);
    expect(() => parseOfficeConfig({ adapters: [{ kind: 'claude-code', decide: 'yes' }] }, 'c.yaml')).toThrow(/decide: true or false/);
    for (const holdSeconds of [4, 271, 1.5, '60']) {
      expect(() => parseOfficeConfig({ adapters: [{ kind: 'claude-code', decide: true, holdSeconds }] }, 'c.yaml')).toThrow(/holdSeconds: a whole number from 5 to 270/);
    }
  });

  it('refuses mistakes with a message naming the file and the field', () => {
    const cases: Array<[unknown, RegExp]> = [
      [{ adapters: ['skynet'] }, /adapters\[0\].*hermes, webhook, claude-code/],
      [{ adapters: 'hermes' }, /adapters.*list/],
      [{ adapters: ['webhook', 'webhook'] }, /webhook.*twice/],
      [{ adapters: ['hermes', { kind: 'hermes', id: 'hermes2' }] }, /one hermes/],
      [{ adapters: [{ kind: 'webhook', id: 'Bad Id' }] }, /adapters\[0\]\.id/],
      [{ adapters: [{ kind: 'webhook', source: 'fixture' }] }, /adapters\[0\]\.source/],
      [{ seats: { gandalf: { adapter: 'hermes', agent: 'x' } } }, /seats\.gandalf.*not a character/],
      [{ seats: { jim: { adapter: 'webhook', agent: 'x' } } }, /seats\.jim\.adapter.*webhook/],
      [{ seats: { jim: { adapter: 'hermes', agent: '../x' } } }, /seats\.jim\.agent/],
      [{ seats: { jim: 'campaigns' } }, /seats\.jim/],
      [{ seats: { jim: { adapter: 'hermes', agent: 'campaigns', colour: 'red' } } }, /seats\.jim.*colour/],
      [{ adaptors: [] }, /adaptors/],
    ];
    for (const [raw, error] of cases) expect(() => parseOfficeConfig(raw, 'my.yaml'), JSON.stringify(raw)).toThrow(error);
    expect(() => parseOfficeConfig({ adapters: 7 }, 'my.yaml')).toThrow(/my\.yaml/);
  });
});

describe('loadOfficeConfig', () => {
  it('uses the defaults when there is no config file', () => {
    expect(loadOfficeConfig({ env: {}, home: path.join(root, 'nobody') })).toEqual({ file: null, adapters: [{ kind: 'hermes', id: 'hermes' }], seats: {} });
  });

  it('reads ~/.dunder-mifflin-os/config.yaml, or config.json', () => {
    const yamlHome = homeWith('yaml', 'config.yaml', 'adapters: [hermes, claude-code]\nseats:\n  jim: { adapter: claude-code, agent: paper-site }\n');
    expect(loadOfficeConfig({ env: {}, home: yamlHome })).toMatchObject({
      file: path.join(yamlHome, '.dunder-mifflin-os', 'config.yaml'), seats: { jim: { adapter: 'claude-code', agent: 'paper-site' } },
    });
    const jsonHome = homeWith('json', 'config.json', '{"adapters": ["webhook"]}');
    expect(loadOfficeConfig({ env: {}, home: jsonHome }).adapters).toEqual([{ kind: 'webhook', id: 'webhook' }]);
  });

  it('reads the file DMOS_CONFIG names, and fails if it is missing or broken', () => {
    const file = path.join(root, 'custom.yml');
    writeFileSync(file, 'adapters: [webhook]\n');
    expect(loadOfficeConfig({ env: { DMOS_CONFIG: file }, home: root }).adapters).toEqual([{ kind: 'webhook', id: 'webhook' }]);
    expect(() => loadOfficeConfig({ env: { DMOS_CONFIG: path.join(root, 'nope.yaml') }, home: root })).toThrow(/DMOS_CONFIG/);
    writeFileSync(file, 'adapters: [webhook\n');
    expect(() => loadOfficeConfig({ env: { DMOS_CONFIG: file }, home: root })).toThrow(/custom\.yml/);
  });
});

describe('createAdapters', () => {
  const runner: Runner = async () => ({ stdout: '', stderr: '', code: 0, timedOut: false });
  const base = { runner, hermesHome: '/nonexistent', hermesBin: '/nonexistent/hermes', statusUrl: null };

  it('builds the adapters in config order', () => {
    const adapters = createAdapters([{ kind: 'hermes', id: 'hermes', source: 'fixture' }, { kind: 'webhook', id: 'webhook' }, { kind: 'claude-code', id: 'claude-code' }],
      { ...base, env: { DMOS_INGEST_TOKEN: 'x'.repeat(32) } });
    expect(adapters.map((a) => [a.id, a.kind])).toEqual([['hermes', 'hermes'], ['webhook', 'webhook'], ['claude-code', 'claude-code']]);
    expect(adapters[1]?.routes?.[0]?.pattern.test('/api/ingest/deploy-bot')).toBe(true);
    expect(adapters[2]?.routes?.[0]?.pattern.test('/api/hooks/claude-code')).toBe(true);
  });

  it('holds Claude Code permission requests only with decide: true AND writes on', () => {
    const token = { DMOS_INGEST_TOKEN: 'x'.repeat(32) };
    const held = (spec: { decide?: boolean }, env: Record<string, string>) => {
      const [adapter] = createAdapters([{ kind: 'claude-code', id: 'claude-code', ...spec, holdSeconds: 5 }], { ...base, env: { ...token, ...env } });
      const out = adapter!.routes![0]!.handle({ params: [], body: { session_id: 's', cwd: '/w/p', hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'ls' } } });
      void adapter!.close?.();
      return out instanceof Promise;
    };
    expect(held({ decide: true }, { DMOS_ALLOW_WRITES: '1' })).toBe(true);
    expect(held({ decide: true }, {})).toBe(false);
    expect(held({}, { DMOS_ALLOW_WRITES: '1' })).toBe(false);
  });

  it('refuses to start an inbound adapter without a strong DMOS_INGEST_TOKEN', () => {
    expect(() => createAdapters([{ kind: 'webhook', id: 'webhook' }], { ...base, env: {} })).toThrow(/DMOS_INGEST_TOKEN/);
    expect(() => createAdapters([{ kind: 'claude-code', id: 'claude-code' }], { ...base, env: { DMOS_INGEST_TOKEN: 'short' } })).toThrow(/DMOS_INGEST_TOKEN/);
    expect(createAdapters([{ kind: 'hermes', id: 'hermes' }], { ...base, env: {} })).toHaveLength(1);
  });
});
