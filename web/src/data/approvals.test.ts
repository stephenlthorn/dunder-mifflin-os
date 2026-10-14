// Approvals at the browser's data boundary: the snapshot's list and SSE updates are untrusted until parsed.
import { describe, expect, it } from 'vitest';
import type { Approval, OfficeSnapshot } from '@shared/contract';
import { parseEvent, parseSnapshot } from './guards';
import { applyEvent } from './merge';

const OK: Approval = {
  id: 'hermes:t_ask.blocked', adapter: 'hermes', personId: 'andy', from: 'Andy Bernard', kind: 'question', title: 'Post the welcome thread?',
  detail: 'Draft is ready.', requestedAt: '2026-10-13T14:00:00.000Z', risk: 'medium', decidable: true,
  actions: { approve: 'Unblock it', reject: 'Archive the card' },
};
const base = { people: [], presence: {}, rooms: [], tasks: [] };

describe('approvals in snapshots and events', () => {
  it('keeps well-formed approvals and drops the rest', () => {
    const snap = parseSnapshot({
      ...base,
      approvals: [OK, { ...OK, id: '' }, { ...OK, kind: 'bribe' }, { ...OK, risk: 'extreme' }, { ...OK, decidable: 'yes' }, 'nope',
        { ...OK, id: 'webhook:x.1', personId: undefined, actions: { approve: 3 }, detail: 'x'.repeat(5000) }],
    });
    expect(snap?.approvals?.[0]).toEqual(OK);
    expect(snap?.approvals).toHaveLength(2);
    expect(snap?.approvals?.[1]).toMatchObject({ id: 'webhook:x.1', from: 'Andy Bernard' });
    expect(snap?.approvals?.[1]?.actions).toBeUndefined();
    expect(snap?.approvals?.[1]?.personId).toBeUndefined();
    expect(snap?.approvals?.[1]?.detail?.length).toBeLessThanOrEqual(1000);
  });

  it('leaves approvals out of a snapshot from an older server', () => {
    expect(parseSnapshot(base)?.approvals).toBeUndefined();
  });

  it('replaces approvals from an SSE update and leaves them alone otherwise', () => {
    const snap = parseSnapshot({ ...base, approvals: [OK] }) as OfficeSnapshot;
    expect(applyEvent(snap, parseEvent(JSON.stringify({ approvals: [] }))!).approvals).toEqual([]);
    expect(applyEvent(snap, parseEvent(JSON.stringify({ tasks: [] }))!).approvals).toEqual([OK]);
  });
});
