import { describe, expect, it } from 'vitest';
import type { Approval, OfficeSnapshot } from '@shared/contract';
import { DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { askingIds, decideBlocker, needYouCount, newRings, phoneKeys } from './needsYou';

const item = (over: Partial<Approval> & { id: string }): Approval => ({
  adapter: 'hermes', from: 'Andy Bernard', personId: 'andy', kind: 'question', title: 'Post it?', requestedAt: '2026-10-13T14:00:00.000Z',
  risk: 'medium', decidable: true, ...over,
});
const snap = (approvals: Approval[], presence: OfficeSnapshot['presence'] = {}): OfficeSnapshot => ({
  ...DEMO_SNAPSHOT, presence: { ...DEMO_SNAPSHOT.presence, ...presence }, approvals,
});

describe('who needs you', () => {
  it('raises the hand of bots that need input or have something pending', () => {
    const s = snap([item({ id: 'hermes:a', personId: 'sadiq' })], { andy: { status: 'needs-input', activity: 'Which forum?' } });
    expect([...askingIds(s)].sort()).toEqual(['andy', 'sadiq']);
  });

  it('counts each asker once, plus requests from agents without a desk', () => {
    const s = snap([
      item({ id: 'hermes:a', personId: 'andy' }), item({ id: 'hermes:b', personId: 'andy' }),
      item({ id: 'hermes:c', personId: undefined, from: 'party-planner' }),
    ], { andy: { status: 'needs-input' }, pam: { status: 'needs-input' } });
    expect(needYouCount(s)).toBe(3); // andy, pam, party-planner
    expect(needYouCount(DEMO_SNAPSHOT)).toBe(0);
  });

  it('rings the phone (chime) only for what the needs-input notifications miss', () => {
    const s = snap([item({ id: 'hermes:a', personId: 'andy' }), item({ id: 'hermes:b', personId: 'sadiq' }), item({ id: 'hermes:c', personId: undefined })],
      { andy: { status: 'needs-input' } });
    expect([...phoneKeys(s)].sort()).toEqual(['approval:hermes:b', 'approval:hermes:c']);
    expect(newRings(new Set(['approval:hermes:b']), phoneKeys(s))).toEqual(['approval:hermes:c']);
    expect(newRings(phoneKeys(s), new Set())).toEqual([]);
  });
});

describe('decideBlocker', () => {
  const s = { ...snap([]), adapters: [{ id: 'hermes', kind: 'hermes', label: 'Hermes', agents: 12, capabilities: { chat: true, createTask: true, approvals: true, pause: false, stop: false } },
    { id: 'old', kind: 'webhook', label: 'Webhook', agents: 1, capabilities: { chat: false, createTask: false, approvals: false, pause: false, stop: false } }] };
  it('says why you cannot decide here, or nothing when you can', () => {
    expect(decideBlocker(s, item({ id: 'hermes:a' }), true)).toBeNull();
    expect(decideBlocker(s, item({ id: 'hermes:a' }), false)).toMatch(/read-only.*DMOS_ALLOW_WRITES=1/i);
    expect(decideBlocker(s, item({ id: 'hermes:a', decidable: false }), true)).toMatch(/where Andy Bernard runs/);
    expect(decideBlocker(s, item({ id: 'old:a', adapter: 'old' }), true)).toMatch(/can't take decisions/);
  });
});
