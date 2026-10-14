// Adapter approvals -> the snapshot's `approvals` (person ids, global ids, scrubbed); a working or idle bot with one
// pending needs you (status needs-input), the one signal the map, filters and notifications read.
import { describe, expect, it } from 'vitest';
import type { AdapterSnapshot } from '../src/adapters/types.ts';
import type { AdapterReading } from '../src/office/compose.ts';
import { buildOffice, defaultOfficeSetup } from '../src/office/office.ts';
import { mergeSeatRules } from '../src/office/seating.ts';
import { DEFAULT_SEATS } from '../src/roster.ts';
import { diffSnapshots, fullUpdate } from '../src/domain/diff.ts';
import { DIRTY_TEXT } from './adapters/contractSuite.ts';
import { LEAK_PATTERNS } from './helpers/leakScan.ts';

const NOW = 1_800_000_000;
const iso = (s: number) => new Date(s * 1000).toISOString();
const WITH = { chat: true, createTask: true, approvals: true, pause: false, stop: false };
const WITHOUT = { ...WITH, approvals: false };

const hermes: AdapterSnapshot = {
  agents: [{ id: 'campaigns', name: 'Dwight Schrute', role: 'Campaigns' }, { id: 'chief', name: 'Pam Beesly', role: 'Chief' }, { id: 'tech', role: 'Tech' }],
  presence: { campaigns: { status: 'working', activity: 'Selling paper' }, chief: { status: 'idle' }, tech: { status: 'needs-input', activity: 'Which repo?' } },
  tasks: [],
  rooms: [],
  approvals: [
    { id: 't_old.blocked', agentId: 'campaigns', kind: 'question', title: 'Send the list?', detail: DIRTY_TEXT, requestedAt: iso(NOW - 3600), risk: 'medium',
      actions: { approve: 'Unblock the card', reject: 'Archive the card' } },
    { id: 't_new.review', agentId: 'party-planner', kind: 'task', title: 'Publish the guide', requestedAt: iso(NOW - 60), decidable: true },
    { id: 'bad id!', agentId: 'campaigns', kind: 'question', title: 'Malformed id is dropped', requestedAt: iso(NOW) },
    { id: 't_when', agentId: 'campaigns', kind: 'question', title: 'No real time is dropped', requestedAt: 'yesterday' },
  ],
};
const quiet: AdapterSnapshot = {
  agents: [{ id: 'deploy-bot', role: 'Ships' }], presence: { 'deploy-bot': { status: 'idle' } }, tasks: [], rooms: [],
  approvals: [{ id: 'a1', agentId: 'deploy-bot', kind: 'permission', title: 'Not shown: no approvals capability', requestedAt: iso(NOW) }],
};

const readings = (hermesSnap: AdapterSnapshot = hermes): AdapterReading[] => [
  { adapter: { id: 'hermes', kind: 'hermes', label: 'Hermes', capabilities: WITH }, snapshot: hermesSnap },
  { adapter: { id: 'webhook', kind: 'webhook', label: 'Webhook', capabilities: WITHOUT }, snapshot: quiet },
];
const setup = defaultOfficeSetup(mergeSeatRules(DEFAULT_SEATS, {}));

describe('approvals in the office snapshot', () => {
  const { snapshot } = buildOffice(readings(), setup, NOW);

  it('lists valid approvals newest first with global ids, who asks and defaults filled in', () => {
    expect(snapshot.approvals?.map((a) => a.id)).toEqual(['hermes:t_new.review', 'hermes:t_old.blocked']);
    expect(snapshot.approvals?.[0]).toEqual({
      id: 'hermes:t_new.review', adapter: 'hermes', from: 'party-planner', kind: 'task', title: 'Publish the guide',
      requestedAt: iso(NOW - 60), risk: 'medium', decidable: true,
    });
    expect(snapshot.approvals?.[1]).toMatchObject({
      personId: 'dwight', from: 'Dwight Schrute', risk: 'medium', decidable: true, actions: { approve: 'Unblock the card', reject: 'Archive the card' },
    });
  });

  it('scrubs free text', () => {
    const text = JSON.stringify(snapshot.approvals);
    expect(LEAK_PATTERNS.filter(([, re]) => re.test(text)).map(([k]) => k)).toEqual([]);
  });

  it('shows a working or idle bot with a pending approval as needing you, with what it asks and since when', () => {
    expect(snapshot.presence.dwight).toEqual({ status: 'needs-input', activity: 'Send the list?', since: iso(NOW - 3600) });
    expect(snapshot.presence.sadiq).toMatchObject({ status: 'needs-input', activity: 'Which repo?' });
    expect(snapshot.presence.pam).toMatchObject({ status: 'idle' });
    expect(snapshot.presence.toby).toEqual({ status: 'no-bot' });
  });

  it('leaves a bot in a meeting, in error or offline as it is (its approval is still listed)', () => {
    for (const status of ['meeting', 'error', 'offline'] as const) {
      const snap = buildOffice(readings({ ...hermes, presence: { ...hermes.presence, campaigns: { status, activity: 'Busy', roomId: 'council' } } }), setup, NOW).snapshot;
      expect(snap.presence.dwight?.status).toBe(status);
      expect(snap.approvals?.some((a) => a.personId === 'dwight')).toBe(true);
    }
  });

  it('sends approval changes over SSE (replaced, like tasks)', () => {
    const later = buildOffice(readings({ ...hermes, approvals: hermes.approvals?.slice(0, 1) }), setup, NOW).snapshot;
    expect(fullUpdate(snapshot).approvals).toHaveLength(2);
    const update = diffSnapshots(snapshot, later);
    expect(update?.approvals?.map((a) => a.id)).toEqual(['hermes:t_old.blocked']);
    expect(diffSnapshots(later, later)).toBeNull();
  });

  it('keeps at most 50, newest first', () => {
    const many = Array.from({ length: 60 }, (_, i) => ({ id: `t_${i}.blocked`, agentId: 'tech', kind: 'question' as const, title: `Card ${i}`, requestedAt: iso(NOW - i) }));
    const snap = buildOffice(readings({ ...hermes, approvals: many }), setup, NOW).snapshot;
    expect(snap.approvals).toHaveLength(50);
    expect(snap.approvals?.[0]?.title).toBe('Card 0');
  });
});
