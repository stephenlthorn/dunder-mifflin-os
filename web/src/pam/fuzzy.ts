// Fuzzy matching for Ask Pam: exact > prefix > word start > substring > letters in order (initials score well).

export function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const isWordStart = (text: string, i: number) => i === 0 || /[^a-z0-9]/.test(text[i - 1]);

/** Positions of q's letters in text, in order: a consecutive letter first, else (if `starts`) the next word start, else the next one. */
function positions(q: string, text: string, starts: boolean): number[] | null {
  const found: number[] = [];
  let at = -1;
  for (const ch of q) {
    let next = text[at + 1] === ch ? at + 1 : text.indexOf(ch, at + 1);
    if (next < 0) return null;
    if (starts && next !== at + 1) {
      for (let i = next; i >= 0; i = text.indexOf(ch, i + 1)) {
        if (isWordStart(text, i)) { next = i; break; }
      }
    }
    found.push(next);
    at = next;
  }
  return found;
}

/** Letters of `q` found in order in `text`: rewards word starts and runs, penalises gaps. Between 1 and 30. */
function scatteredScore(q: string, text: string): number | null {
  const found = positions(q, text, true) ?? positions(q, text, false);
  if (!found) return null;
  const score = found.reduce((acc, pos, i) => {
    const prev = i === 0 ? -1 : found[i - 1];
    return acc + (pos === prev + 1 ? 2 : 0) + (isWordStart(text, pos) ? 3 : 0) - 0.2 * Math.max(0, pos - prev - 1);
  }, 10);
  return Math.min(30, Math.max(1, score));
}

/** How well `query` (one word) matches `text`: null for no match, 0 for an empty query, higher is better (max 100). */
export function fuzzyScore(query: string, text: string): number | null {
  const q = normalize(query.trim());
  if (!q) return 0;
  const t = normalize(text);
  if (t === q) return 100;
  if (t.startsWith(q)) return 80 + 10 * (q.length / t.length);
  const index = t.indexOf(q);
  if (index >= 0) {
    for (let i = index; i >= 0; i = t.indexOf(q, i + 1)) if (isWordStart(t, i)) return 60;
    return 40;
  }
  return scatteredScore(q, t);
}
