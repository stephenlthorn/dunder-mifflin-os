// Label placement for status chips: try the spot above the head, then nearby spots; stack upward as a last resort.
// Labels nearer the camera (lower on screen) and higher priority go first. Optional labels may be hidden.
export type LabelRect = {
  id: string; x: number; y: number; w: number; h: number; // x = centre, y = bottom edge
  owner?: string; // obstacles owned by a label (its own figure) do not block it
  priority?: number; // lower is placed first
  optional?: boolean; // may be hidden when nothing fits
};
export type Offset = { dx: number; dy: number };

const GAP = 2;
const MAX_STACK = 10;

type Placed = { r: LabelRect; x: number; y: number };
const hits = (l: LabelRect, x: number, y: number, p: Placed) =>
  p.r.owner !== l.id && Math.abs(x - p.x) < (l.w + p.r.w) / 2 + GAP && y - l.h < p.y + GAP && p.y - p.r.h < y + GAP;

function candidates(l: LabelRect): Offset[] {
  const up = l.h + GAP;
  const side = l.w * 0.55;
  const far = l.w * 1.05;
  return [
    { dx: 0, dy: 0 }, { dx: 0, dy: -up }, { dx: -side, dy: 0 }, { dx: side, dy: 0 },
    { dx: -side, dy: -up }, { dx: side, dy: -up }, { dx: 0, dy: -2 * up },
    { dx: -far, dy: 0 }, { dx: far, dy: 0 }, { dx: -side, dy: up }, { dx: side, dy: up },
    { dx: -far, dy: -up }, { dx: far, dy: -up }, { dx: -side, dy: -2 * up }, { dx: side, dy: -2 * up },
  ];
}

export function layoutLabels(labels: readonly LabelRect[], obstacles: readonly LabelRect[]): Record<string, Offset | null> {
  const placed: Placed[] = obstacles.map((r) => ({ r, x: r.x, y: r.y }));
  const out: Record<string, Offset | null> = {};
  const order = [...labels].sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0) || b.y - a.y);
  for (const l of order) {
    const free = candidates(l).find((c) => !placed.some((p) => hits(l, l.x + c.dx, l.y + c.dy, p)));
    if (free) {
      placed.push({ r: l, x: l.x + free.dx, y: l.y + free.dy });
      out[l.id] = free;
      continue;
    }
    if (l.optional) {
      out[l.id] = null;
      continue;
    }
    let y = l.y;
    for (let step = 0; step < MAX_STACK; step += 1) {
      const hit = placed.find((p) => hits(l, l.x, y, p));
      if (!hit) break;
      y = hit.y - hit.r.h - GAP;
    }
    placed.push({ r: l, x: l.x, y });
    out[l.id] = { dx: 0, dy: y - l.y };
  }
  return out;
}
