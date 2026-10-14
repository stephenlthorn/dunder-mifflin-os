// Every approval decision is written to a local append-only log (~/.dunder-mifflin-os/audit.log) BEFORE it is
// carried out; if the log can't be written the decision is refused (fail closed). No secrets in it.
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createAuditLog } from '../src/audit/auditLog.ts';
import { DIRTY_TEXT } from './adapters/contractSuite.ts';
import { LEAK_PATTERNS } from './helpers/leakScan.ts';

const root = mkdtempSync(path.join(tmpdir(), 'dmos-audit-'));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const AT = Date.parse('2026-10-13T15:00:00.000Z');

describe('audit log', () => {
  it('creates a private directory and file and appends one JSON line per entry, never rewriting', () => {
    const file = path.join(root, 'fresh', 'audit.log');
    const audit = createAuditLog({ file, now: () => AT });
    expect(audit.append({ event: 'approval.decide', approval: 'hermes:t_1.blocked', decision: 'approve' })).toBe(true);
    expect(audit.append({ event: 'approval.decided', approval: 'hermes:t_1.blocked', status: 200 })).toBe(true);
    const lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    expect(lines).toEqual([
      { at: '2026-10-13T15:00:00.000Z', event: 'approval.decide', approval: 'hermes:t_1.blocked', decision: 'approve' },
      { at: '2026-10-13T15:00:00.000Z', event: 'approval.decided', approval: 'hermes:t_1.blocked', status: 200 },
    ]);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    expect(statSync(path.dirname(file)).mode & 0o777).toBe(0o700);
  });

  it('keeps what was there before', () => {
    const file = path.join(root, 'old.log');
    writeFileSync(file, '{"at":"2026-01-01T00:00:00.000Z","event":"earlier"}\n', { mode: 0o600 });
    createAuditLog({ file, now: () => AT }).append({ event: 'later' });
    expect(readFileSync(file, 'utf8').trim().split('\n')).toHaveLength(2);
  });

  it('scrubs secrets, home paths and phone numbers, caps long text and drops undefined fields', () => {
    const file = path.join(root, 'dirty.log');
    createAuditLog({ file, now: () => AT }).append({ event: 'approval.decide', title: DIRTY_TEXT, note: 'x'.repeat(2000), person: undefined });
    const text = readFileSync(file, 'utf8');
    expect(LEAK_PATTERNS.filter(([, re]) => re.test(text)).map(([k]) => k)).toEqual([]);
    const entry = JSON.parse(text) as Record<string, unknown>;
    expect(String(entry.note).length).toBeLessThanOrEqual(500);
    expect('person' in entry).toBe(false);
    expect(text.trim().split('\n')).toHaveLength(1); // a newline in a value can't forge a second entry
  });

  it('reports failure instead of throwing when it cannot write (the caller then refuses the decision)', () => {
    const dir = path.join(root, 'is-a-dir.log');
    mkdirSync(dir);
    expect(createAuditLog({ file: dir, now: () => AT }).append({ event: 'approval.decide' })).toBe(false);
  });
});
