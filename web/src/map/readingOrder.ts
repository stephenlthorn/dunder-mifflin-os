// Keyboard order for the map: people and room signs in reading order (rows top to bottom, left to right). Pure.
export type MapTarget = { key: string; x: number; y: number };
export type NavMove = 'next' | 'prev' | 'up' | 'down' | 'first' | 'last';

/** Rows of targets: a target joins the current row while within `rowPx` of the row's first (topmost) target. */
export function readingRows(targets: readonly MapTarget[], rowPx: number): MapTarget[][] {
  const sorted = [...targets].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = sorted.reduce<MapTarget[][]>((acc, t) => {
    const row = acc[acc.length - 1];
    return row && t.y - row[0].y <= rowPx ? [...acc.slice(0, -1), [...row, t]] : [...acc, [t]];
  }, []);
  return rows.map((row) => [...row].sort((a, b) => a.x - b.x));
}

export const flatOrder = (rows: readonly MapTarget[][]): string[] => rows.flat().map((t) => t.key);

function locate(rows: readonly MapTarget[][], key: string | null): { row: number; col: number } | null {
  for (let row = 0; row < rows.length; row += 1) {
    const col = rows[row].findIndex((t) => t.key === key);
    if (col >= 0) return { row, col };
  }
  return null;
}

/** The target to focus after a move, or null when the move would leave the map (or there is nothing to focus). */
export function moveFocus(rows: readonly MapTarget[][], current: string | null, move: NavMove): string | null {
  const order = flatOrder(rows);
  if (order.length === 0) return null;
  const at = locate(rows, current);
  const first = order[0];
  const last = order[order.length - 1];
  if (move === 'first') return first;
  if (move === 'last') return last;
  if (!at) return move === 'next' || move === 'down' ? first : last;
  const index = order.indexOf(rows[at.row][at.col].key);
  if (move === 'next') return order[index + 1] ?? null;
  if (move === 'prev') return order[index - 1] ?? null;
  const target = rows[at.row + (move === 'down' ? 1 : -1)];
  if (!target) return null;
  const x = rows[at.row][at.col].x;
  return target.reduce((best, t) => (Math.abs(t.x - x) < Math.abs(best.x - x) ? t : best)).key;
}
