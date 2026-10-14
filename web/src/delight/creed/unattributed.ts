// Creed's corner in the browser: what the server lists (GET /api/unattributed: agents without a desk, cards and
// requests whose owner has none) plus what the snapshot alone shows (requests with no person, open cards nobody owns
// outside any room), so the fixture demo and older servers still have a corner. Pure.
import type { OfficeSnapshot } from '@shared/contract';
import { MAX_UNATTRIBUTED, UNATTRIBUTED_KINDS, type UnattributedItem, type UnattributedReport } from '@shared/unattributed';

const byNewest = (a: UnattributedItem, b: UnattributedItem) => ((a.at ?? '') < (b.at ?? '') ? 1 : (a.at ?? '') > (b.at ?? '') ? -1 : 0);

export function snapshotUnattributed(s: OfficeSnapshot): UnattributedItem[] {
  const cards = s.tasks.filter((t) => !t.ownerId && !t.roomId && t.status !== 'done').map((t): UnattributedItem => ({
    id: `card:${t.id}`, kind: 'card', title: t.title, detail: `Nobody owns this card · ${t.status}`, at: t.updatedAt,
  }));
  const asks = (s.approvals ?? []).filter((a) => !a.personId).map((a): UnattributedItem => ({
    id: `approval:${a.id}`, kind: 'approval', adapter: a.adapter, agentId: a.from, title: a.title,
    detail: `Asked by “${a.from}”, who has no desk · answer it at Toby's desk`, at: a.requestedAt,
  }));
  return [...cards, ...asks].sort(byNewest);
}

/** The server's items win over the browser's own guess at the same thing. */
export function mergeUnattributed(server: readonly UnattributedItem[] | null, local: readonly UnattributedItem[]): UnattributedItem[] {
  const seen = new Set((server ?? []).map((i) => i.id));
  return [...(server ?? []), ...local.filter((i) => !seen.has(i.id))].sort(byNewest).slice(0, MAX_UNATTRIBUTED);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) => (typeof v === 'string' && v.length > 0 ? v.slice(0, max) : undefined);

function parseItem(v: unknown): UnattributedItem | null {
  if (!isObj(v)) return null;
  const id = text(v.id, 200);
  const title = text(v.title, 300);
  const detail = text(v.detail, 400);
  const kind = (UNATTRIBUTED_KINDS as readonly unknown[]).includes(v.kind) ? (v.kind as UnattributedItem['kind']) : null;
  if (!id || !title || !detail || !kind) return null;
  const extra = Object.fromEntries(([['adapter', 40], ['agentId', 80], ['at', 40]] as const).flatMap(([k, max]) => {
    const value = text(v[k], max);
    return value ? [[k, value]] : [];
  }));
  return { id, kind, title, detail, ...extra };
}

export function parseUnattributed(v: unknown): UnattributedReport | null {
  if (!isObj(v) || !Array.isArray(v.items)) return null;
  return {
    generatedAt: text(v.generatedAt, 40) ?? new Date(0).toISOString(),
    items: v.items.map(parseItem).filter((i): i is UnattributedItem => i !== null).slice(0, MAX_UNATTRIBUTED),
  };
}

/** What Creed's desk says, or in Toby mode what the plain badge says. */
export function creedWords(count: number, toby: boolean): { chip: string; label: string; title: string } {
  if (toby) return { chip: count ? `${count} unattributed` : '', label: `Unattributed activity: ${count} item${count === 1 ? '' : 's'}`, title: 'Unattributed activity' };
  const things = count === 1 ? '1 thing nobody can explain' : `${count} things nobody can explain`;
  return { chip: count ? `Knows something (${count})` : '', label: `Creed’s corner: ${things}`, title: 'Creed’s corner' };
}
