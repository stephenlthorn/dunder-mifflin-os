// Creed's corner: what the adapters report that the office can't put at anyone's desk. Agents with no desk (every
// spare desk taken), open cards whose owner has no desk (or that nobody owns, outside any room), and requests from
// such agents. Genuinely useful drift detection: a bot nobody hired, a card assigned to a profile that is gone.
// Pure: no I/O. Free text is scrubbed and clipped on the way out, like everything the browser gets.
import type { Presence } from '../../../shared/contract.ts';
import { MAX_UNATTRIBUTED, type UnattributedItem } from '../../../shared/unattributed.ts';
import type { AgentTask, ApprovalRequest } from '../adapters/types.ts';
import { scrubText } from '../domain/scrub.ts';
import type { AdapterReading } from './compose.ts';
import type { Seating } from './seating.ts';

const MAX_TEXT = 160;
const STATUS_WORD: Readonly<Record<Presence['status'], string>> = {
  working: 'working', idle: 'idle', meeting: 'in a meeting', error: 'error', offline: 'offline', 'needs-input': 'waiting on you', 'no-bot': 'no bot',
};

const clip = (text: string): string => {
  const clean = scrubText(text.replace(/\s+/g, ' ').trim());
  return clean.length > MAX_TEXT ? `${clean.slice(0, MAX_TEXT - 1)}…` : clean;
};

function agentItems(reading: AdapterReading, seating: Seating): UnattributedItem[] {
  const adapter = reading.adapter.id;
  return seating.unseated.filter((u) => u.adapterId === adapter).map((u) => {
    const info = reading.snapshot.agents.find((a) => a.id === u.agentId);
    const p = reading.snapshot.presence[u.agentId];
    const state = p ? `${STATUS_WORD[p.status]}${p.activity ? `: ${p.activity}` : ''}` : 'not reporting';
    return {
      id: `agent:${adapter}/${u.agentId}`, kind: 'agent', adapter, agentId: u.agentId, title: clip(info?.name ?? u.agentId),
      detail: clip(`No desk: every spare desk is taken · ${reading.adapter.label} · ${state}`), ...(p?.since ? { at: p.since } : {}),
    };
  });
}

const orphan = (t: AgentTask, adapter: string, seating: Seating): boolean => t.status !== 'done'
  && (t.ownerAgentId === undefined ? t.roomId === undefined : seating.personOf(adapter, t.ownerAgentId) === undefined);

function cardItems(reading: AdapterReading, seating: Seating): UnattributedItem[] {
  const adapter = reading.adapter.id;
  return reading.snapshot.tasks.filter((t) => orphan(t, adapter, seating)).map((t) => ({
    id: `card:${t.id}`, kind: 'card', adapter, ...(t.ownerAgentId ? { agentId: t.ownerAgentId } : {}), title: clip(t.title),
    detail: clip(t.ownerAgentId ? `Assigned to “${t.ownerAgentId}”, who has no desk · ${t.status}` : `Nobody owns this card · ${t.status}`),
    at: t.updatedAt,
  }));
}

function approvalItems(reading: AdapterReading, seating: Seating): UnattributedItem[] {
  if (!reading.adapter.capabilities.approvals) return [];
  const adapter = reading.adapter.id;
  return (reading.snapshot.approvals ?? []).filter((r: ApprovalRequest) => seating.personOf(adapter, r.agentId) === undefined).map((r) => ({
    id: `approval:${adapter}:${r.id}`, kind: 'approval', adapter, agentId: r.agentId, title: clip(r.title),
    detail: clip(`Asked by “${r.agentId}”, who has no desk · answer it at Toby's desk`), at: r.requestedAt,
  }));
}

export function unattributedOf(readings: ReadonlyArray<AdapterReading>, seating: Seating): UnattributedItem[] {
  return readings
    .flatMap((r) => [...agentItems(r, seating), ...cardItems(r, seating), ...approvalItems(r, seating)])
    .sort((a, b) => ((a.at ?? '') < (b.at ?? '') ? 1 : (a.at ?? '') > (b.at ?? '') ? -1 : 0))
    .slice(0, MAX_UNATTRIBUTED);
}
