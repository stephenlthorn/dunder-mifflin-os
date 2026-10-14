import { describe, expect, it } from 'vitest';
import type { UnattributedItem } from '@shared/unattributed';
import { DEMO_OFFICE } from '@shared/fixtures/demo-approvals';
import { creedWords, mergeUnattributed, parseUnattributed, snapshotUnattributed } from './unattributed';

describe('snapshotUnattributed (what the browser can see by itself)', () => {
  it('lists requests from agents without a desk and open cards nobody owns outside any room', () => {
    const snap = {
      ...DEMO_OFFICE,
      tasks: [
        ...DEMO_OFFICE.tasks,
        { id: 'orphan', title: 'Nobody\'s card', status: 'doing' as const, shared: false, updatedAt: '2026-10-13T14:30:00.000Z' },
        { id: 'closed', title: 'Done and dusted', status: 'done' as const, shared: false, updatedAt: '2026-10-13T14:00:00.000Z' },
      ],
    };
    const items = snapshotUnattributed(snap);
    expect(items.map((i) => i.id)).toEqual(['card:orphan', 'approval:hermes:t_demo_video.blocked']);
    expect(items[1]).toMatchObject({ kind: 'approval', adapter: 'hermes', agentId: 'party-planner', title: 'Record the Thursday demo video' });
    expect(items[0]?.detail).toBe('Nobody owns this card · doing');
  });
});

describe('mergeUnattributed', () => {
  const local: UnattributedItem[] = [{ id: 'card:a', kind: 'card', title: 'A', detail: 'Nobody owns this card · todo', at: '2026-10-13T10:00:00.000Z' }];
  it('takes the server\'s version of the same item and sorts newest first', () => {
    const server: UnattributedItem[] = [
      { id: 'card:a', kind: 'card', title: 'A', detail: 'from the server', at: '2026-10-13T10:00:00.000Z' },
      { id: 'agent:webhook/x', kind: 'agent', title: 'x', detail: 'No desk', at: '2026-10-13T11:00:00.000Z' },
    ];
    expect(mergeUnattributed(server, local).map((i) => [i.id, i.detail])).toEqual([['agent:webhook/x', 'No desk'], ['card:a', 'from the server']]);
    expect(mergeUnattributed(null, local)).toEqual(local);
  });
});

describe('parseUnattributed (the boundary)', () => {
  it('keeps well-formed items, clips text and drops the rest', () => {
    const parsed = parseUnattributed({
      generatedAt: '2026-10-13T15:00:00.000Z',
      items: [
        { id: 'agent:w/x', kind: 'agent', title: 'x'.repeat(900), detail: 'No desk', adapter: 'webhook', agentId: 'x', at: '2026-10-13T11:00:00.000Z' },
        { id: 'bad', kind: 'virus', title: 't', detail: 'd' },
        { kind: 'card', title: 'no id', detail: 'd' },
        'nope',
      ],
    });
    expect(parsed?.items).toHaveLength(1);
    expect(parsed?.items[0]?.title.length).toBeLessThanOrEqual(300);
    expect(parseUnattributed({ items: 'x' })).toBeNull();
    expect(parseUnattributed(null)).toBeNull();
  });
});

describe('creedWords', () => {
  it('says what Creed knows, or plainly what is unattributed in Toby mode', () => {
    expect(creedWords(3, false)).toEqual({ chip: 'Knows something (3)', label: 'Creed’s corner: 3 things nobody can explain', title: 'Creed’s corner' });
    expect(creedWords(1, true)).toEqual({ chip: '1 unattributed', label: 'Unattributed activity: 1 item', title: 'Unattributed activity' });
    expect(creedWords(0, false).chip).toBe('');
  });
});
