// Creed's corner on the server: agents without a desk, cards whose owner has no desk, and requests from deskless
// agents, worked out from the adapters' readings and the seating. Text leaves scrubbed.
import { describe, expect, it } from 'vitest';
import type { AdapterSnapshot } from '../src/adapters/types.ts';
import type { AdapterReading } from '../src/office/compose.ts';
import { buildOffice, defaultOfficeSetup } from '../src/office/office.ts';
import { mergeSeatRules } from '../src/office/seating.ts';
import { unattributedOf } from '../src/office/unattributed.ts';
import { DEFAULT_SEATS } from '../src/roster.ts';

const NOW = 1_800_000_000;
const iso = (s: number) => new Date(s * 1000).toISOString();
const CAPS = { chat: false, createTask: false, approvals: true, pause: false, stop: false };

const hermes: AdapterSnapshot = {
  agents: [{ id: 'campaigns', name: 'Dwight Schrute', role: 'Campaigns' }],
  presence: { campaigns: { status: 'working' } },
  tasks: [
    { id: 't_mine', title: 'Seated card', status: 'doing', ownerAgentId: 'campaigns', shared: false, updatedAt: iso(NOW - 60) },
    { id: 't_ghost', title: 'Re-order paper for /Users/someone/branch', status: 'blocked', ownerAgentId: 'ghost', shared: false, updatedAt: iso(NOW - 120) },
    { id: 't_ghost_done', title: 'Old ghost card', status: 'done', ownerAgentId: 'ghost', shared: false, updatedAt: iso(NOW - 90) },
    { id: 't_nobody', title: 'Nobody owns this', status: 'todo', shared: false, updatedAt: iso(NOW - 300) },
    { id: 't_room', title: 'Room card, no owner', status: 'todo', roomId: 'ops', shared: true, updatedAt: iso(NOW - 30) },
  ],
  rooms: [],
};
const webhook: AdapterSnapshot = {
  agents: ['one', 'two', 'three', 'four'].map((id) => ({ id, role: 'Webhook agent' })),
  presence: {
    one: { status: 'idle' }, two: { status: 'idle' }, three: { status: 'idle' },
    four: { status: 'working', activity: 'Deploying with token sk-ant-abcdefghijklmnop1234', since: iso(NOW - 45) },
  },
  tasks: [],
  rooms: [],
  approvals: [{ id: 'r1', agentId: 'four', kind: 'permission', title: 'Push to production?', requestedAt: iso(NOW - 40) }],
};
const readings: AdapterReading[] = [
  { adapter: { id: 'hermes', kind: 'hermes', label: 'Hermes', capabilities: { ...CAPS, approvals: false } }, snapshot: hermes },
  { adapter: { id: 'webhook', kind: 'webhook', label: 'Webhook', capabilities: CAPS }, snapshot: webhook },
];
const setup = defaultOfficeSetup(mergeSeatRules(DEFAULT_SEATS, {}));

describe('unattributedOf', () => {
  const office = buildOffice(readings, setup, NOW);
  const items = office.unattributed;
  const byId = (id: string) => items.find((i) => i.id === id);

  it('lists an agent with no desk (the spare desks are taken), with its status and scrubbed activity', () => {
    expect(office.seating.unseated).toEqual([{ adapterId: 'webhook', agentId: 'four' }]);
    const agent = byId('agent:webhook/four');
    expect(agent).toMatchObject({ kind: 'agent', adapter: 'webhook', agentId: 'four', title: 'four', at: iso(NOW - 45) });
    expect(agent?.detail).toContain('No desk');
    expect(agent?.detail).toContain('working');
    expect(agent?.detail).not.toContain('sk-ant');
  });

  it('lists open cards whose owner has no desk, and cards nobody owns outside a room; not done ones or seated ones', () => {
    expect(byId('card:t_ghost')).toMatchObject({ kind: 'card', adapter: 'hermes', agentId: 'ghost', at: iso(NOW - 120) });
    expect(byId('card:t_ghost')?.title).toBe('Re-order paper for ~/branch');
    expect(byId('card:t_ghost')?.detail).toContain('ghost');
    expect(byId('card:t_nobody')).toMatchObject({ kind: 'card', title: 'Nobody owns this' });
    expect(byId('card:t_nobody')?.agentId).toBeUndefined();
    for (const id of ['card:t_mine', 'card:t_ghost_done', 'card:t_room']) expect(byId(id), id).toBeUndefined();
  });

  it('lists a request from an agent without a desk under the approval id the inbox uses', () => {
    expect(byId('approval:webhook:r1')).toMatchObject({ kind: 'approval', adapter: 'webhook', agentId: 'four', title: 'Push to production?' });
  });

  it('is newest first, capped, and empty for a tidy office', () => {
    const times = items.map((i) => i.at ?? '');
    expect(times).toEqual([...times].sort().reverse());
    const tidy = buildOffice([readings[0]!].map((r) => ({ ...r, snapshot: { ...r.snapshot, tasks: [hermes.tasks[0]!] } })), setup, NOW);
    expect(tidy.unattributed).toEqual([]);
    const many: AdapterSnapshot = { ...hermes, tasks: Array.from({ length: 80 }, (_, i) => ({ ...hermes.tasks[1]!, id: `t${i}` })) };
    const capped = unattributedOf([{ ...readings[0]!, snapshot: many }], office.seating);
    expect(capped).toHaveLength(50);
  });
});
