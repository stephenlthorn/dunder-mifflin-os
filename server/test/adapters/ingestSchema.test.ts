import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { APPROVAL_KINDS, APPROVAL_RISKS, CONTROL_VERBS, INGEST_STATUSES, INGEST_TYPES, LIMITS, TASK_STATUSES, parseIngestEvent } from '../../src/adapters/ingest/schema.ts';

const NOW = Date.parse('2026-10-13T15:00:00.000Z');
const parse = (body: unknown) => parseIngestEvent(body, NOW);

describe('parseIngestEvent (webhook event schema)', () => {
  it('accepts the four event types', () => {
    expect(parse({ type: 'status', status: 'working', activity: 'Running migrations', name: 'Deploy Bot', role: 'Ships releases' }))
      .toEqual({ ok: true, event: { type: 'status', status: 'working', activity: 'Running migrations', name: 'Deploy Bot', role: 'Ships releases', at: NOW } });
    expect(parse({ type: 'status', status: 'meeting', room: 'ops' })).toMatchObject({ ok: true, event: { room: 'ops' } });
    expect(parse({ type: 'activity', text: 'Opened PR 42' })).toMatchObject({ ok: true, event: { type: 'activity', text: 'Opened PR 42' } });
    expect(parse({ type: 'task', id: 'deploy-42', title: 'Deploy v1.2', status: 'doing', shared: true }))
      .toMatchObject({ ok: true, event: { type: 'task', id: 'deploy-42', title: 'Deploy v1.2', status: 'doing', shared: true } });
    expect(parse({ type: 'message', text: 'Deployed.\nAll green.' })).toMatchObject({ ok: true, event: { text: 'Deployed.\nAll green.' } });
  });

  it('accepts an approval request (with an optional callback for the decision) and its withdrawal', () => {
    expect(parse({ type: 'approval', id: 'deploy-42', title: 'Deploy v1.2 to production?', detail: 'Migrations: 3\nDowntime: none',
      kind: 'permission', risk: 'high', callback: 'https://deploy.example.com/dmos/decision' }))
      .toEqual({ ok: true, event: { type: 'approval', id: 'deploy-42', title: 'Deploy v1.2 to production?', detail: 'Migrations: 3\nDowntime: none',
        kind: 'permission', risk: 'high', callback: 'https://deploy.example.com/dmos/decision', at: NOW } });
    expect(parse({ type: 'approval', id: 'q1', title: 'Which region?' })).toEqual({ ok: true, event: { type: 'approval', id: 'q1', title: 'Which region?', at: NOW } });
    expect(parse({ type: 'approval', id: 'local', title: 'x', callback: 'http://127.0.0.1:9000/decide' })).toMatchObject({ ok: true });
    expect(parse({ type: 'approval-withdrawn', id: 'deploy-42' })).toEqual({ ok: true, event: { type: 'approval-withdrawn', id: 'deploy-42', at: NOW } });
  });

  it('refuses callbacks that are not plain http(s), carry credentials, or use plain http off this machine', () => {
    for (const callback of ['ftp://x.example/a', 'http://deploy.example.com/a', 'https://user:pw@x.example/a', 'javascript:alert(1)', 'not a url',
      `https://x.example/${'a'.repeat(500)}`]) {
      expect(parse({ type: 'approval', id: 'a', title: 'x', callback }), callback).toMatchObject({ ok: false, error: expect.stringMatching(/callback/) });
    }
  });

  it('takes the event time from `at`, clamping the future to now', () => {
    expect(parse({ type: 'activity', text: 'x', at: '2026-10-13T14:59:00Z' })).toMatchObject({ event: { at: NOW - 60_000 } });
    expect(parse({ type: 'activity', text: 'x', at: '2027-01-01T00:00:00Z' })).toMatchObject({ event: { at: NOW } });
    expect(parse({ type: 'activity', text: 'x', at: 'yesterday' })).toMatchObject({ ok: false, error: expect.stringMatching(/at/) });
  });

  it('rejects anything malformed with a message that names the field', () => {
    const cases: Array<[unknown, RegExp]> = [
      [null, /object/], [[], /object/], [{ type: 'party' }, /type/],
      [{ type: 'status', status: 'partying' }, /status/],
      [{ type: 'status', status: 'idle', mood: 'great' }, /mood/],
      [{ type: 'activity' }, /text/], [{ type: 'activity', text: '   ' }, /text/],
      [{ type: 'activity', text: 'a'.repeat(LIMITS.activity + 1) }, /text/],
      [{ type: 'activity', text: 'two\nlines' }, /text/],
      [{ type: 'message', text: 'a'.repeat(LIMITS.text + 1) }, /text/],
      [{ type: 'message', text: 'nul\u0000byte' }, /text/],
      [{ type: 'task', id: 'bad id!', title: 't', status: 'todo' }, /id/],
      [{ type: 'task', id: 'ok', title: 't', status: 'later' }, /status/],
      [{ type: 'task', id: 'ok', title: 't', status: 'todo', shared: 'yes' }, /shared/],
      [{ type: 'status', status: 'meeting', room: '../ops' }, /room/],
      [{ type: 'status', status: 'idle', name: 7 }, /name/],
      [{ type: 'approval', title: 'no id' }, /id/], [{ type: 'approval', id: 'a' }, /title/],
      [{ type: 'approval', id: 'a', title: 't', kind: 'bribe' }, /kind/], [{ type: 'approval', id: 'a', title: 't', risk: 'extreme' }, /risk/],
      [{ type: 'approval', id: 'a', title: 't', detail: 'a'.repeat(LIMITS.detail + 1) }, /detail/],
      [{ type: 'approval-withdrawn' }, /id/], [{ type: 'approval-withdrawn', id: 'a', title: 'x' }, /title/],
    ];
    for (const [body, error] of cases) expect(parse(body), JSON.stringify(body)).toMatchObject({ ok: false, error: expect.stringMatching(error) });
  });
});

describe('docs/adapters/webhook.schema.json', () => {
  const schema = JSON.parse(readFileSync(new URL('../../../docs/adapters/webhook.schema.json', import.meta.url), 'utf8'));
  const variants = schema.oneOf as Array<{ properties: Record<string, { enum?: string[]; const?: string; maxLength?: number; items?: { enum?: string[] } }>; required: string[] }>;
  const byType = Object.fromEntries(variants.map((v) => [v.properties.type?.const, v]));

  it('documents the same event types, statuses and limits as the server enforces', () => {
    expect(Object.keys(byType).sort()).toEqual([...INGEST_TYPES].sort());
    expect(byType.status?.properties.status?.enum).toEqual([...INGEST_STATUSES]);
    expect(byType.task?.properties.status?.enum).toEqual([...TASK_STATUSES]);
    expect(byType.message?.properties.text?.maxLength).toBe(LIMITS.text);
    expect(byType.activity?.properties.text?.maxLength).toBe(LIMITS.activity);
    expect(byType.task?.properties.title?.maxLength).toBe(LIMITS.title);
    expect(byType.approval?.properties.kind?.enum).toEqual([...APPROVAL_KINDS]);
    expect(byType.approval?.properties.risk?.enum).toEqual([...APPROVAL_RISKS]);
    expect(byType.approval?.properties.title?.maxLength).toBe(LIMITS.title);
    expect(byType.approval?.properties.detail?.maxLength).toBe(LIMITS.detail);
    expect(byType.approval?.properties.callback?.maxLength).toBe(LIMITS.callback);
    expect(byType['approval-withdrawn']?.required).toEqual(['type', 'id']);
    expect(byType.controls?.properties.verbs?.items?.enum).toEqual([...CONTROL_VERBS]);
    expect(byType.controls?.properties.callback?.maxLength).toBe(LIMITS.callback);
  });
});
