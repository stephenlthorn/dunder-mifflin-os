// Ask Pam's search: fuzzy words over each item's weighted fields, plus an `s:<status>` filter. Pure.
import { fuzzyScore } from './fuzzy';
import type { PamItem, PamKind } from './items';

export type PamQuery = { tokens: string[]; status?: string };
export type PamSection = { id: 'recent' | 'actions' | 'results'; title: string; items: PamItem[] };

const STATUS_WORDS = ['working', 'idle', 'meeting', 'error', 'offline', 'no-bot', 'needs-input'];
const ALIASES: Record<string, string> = { 'needs-you': 'needs-input' };
const KIND_ORDER: Record<PamKind, number> = { person: 0, bot: 1, timeline: 1.5, room: 2, place: 3, action: 4, control: 4.5, task: 5, job: 6 };
const RECENT_BOOST = 5;
const MAX_RECENT_SHOWN = 5;

export function parseQuery(q: string): PamQuery {
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const statusWord = words.find((w) => w.startsWith('s:') && w.length > 2);
  const tokens = words.filter((w) => w !== statusWord);
  if (!statusWord) return { tokens };
  const value = statusWord.slice(2);
  return { tokens, status: ALIASES[value] ?? STATUS_WORDS.find((s) => s.startsWith(value)) ?? value };
}

/** Sum over tokens of the best weighted field score; null if any token matches nothing. */
function scoreItem(item: PamItem, tokens: readonly string[]): number | null {
  let total = 0;
  for (const token of tokens) {
    let best: number | null = null;
    for (const [text, weight] of item.fields) {
      const s = text ? fuzzyScore(token, text) : null;
      if (s !== null && (best === null || s * weight > best)) best = s * weight;
    }
    if (best === null) return null;
    total += best;
  }
  return total;
}

const byKindThenLabel = (a: PamItem, b: PamItem) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.label.localeCompare(b.label);

export function searchPam(items: readonly PamItem[], query: string, recentIds: readonly string[], limit = 12): PamSection[] {
  const { tokens, status } = parseQuery(query);
  if (tokens.length === 0 && status === undefined) {
    const byId = new Map(items.map((i) => [i.id, i]));
    const recent = recentIds.flatMap((id) => byId.get(id) ?? []).slice(0, MAX_RECENT_SHOWN);
    const actions = items.filter((i) => i.kind === 'action');
    return [
      ...(recent.length ? [{ id: 'recent' as const, title: 'Recent', items: recent }] : []),
      { id: 'actions', title: 'Ask Pam to…', items: actions },
    ];
  }
  const recent = new Set(recentIds);
  const ranked = items
    .filter((i) => status === undefined || i.status === status)
    .flatMap((item) => {
      const score = scoreItem(item, tokens);
      return score === null ? [] : [{ item, score: score + (recent.has(item.id) ? RECENT_BOOST : 0) }];
    })
    .sort((a, b) => b.score - a.score || byKindThenLabel(a.item, b.item))
    .slice(0, limit)
    .map((r) => r.item);
  return [{ id: 'results', title: 'Results', items: ranked }];
}
