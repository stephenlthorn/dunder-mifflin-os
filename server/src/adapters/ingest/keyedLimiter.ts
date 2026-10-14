// Fixed-window rate limits per key (one per agent or session). Windows that have ended are dropped on the next
// call, so the table only ever holds keys seen in the current window.
export type KeyedLimiter = { take(key: string): boolean; size(): number };

export function createKeyedLimiter(opts: { max: number; windowMs: number; clock?: () => number }): KeyedLimiter {
  const clock = opts.clock ?? Date.now;
  let windows: ReadonlyMap<string, { start: number; count: number }> = new Map();

  function take(key: string): boolean {
    const t = clock();
    const live = new Map([...windows].filter(([, w]) => t - w.start < opts.windowMs));
    const current = live.get(key) ?? { start: t, count: 0 };
    const allowed = current.count < opts.max;
    windows = new Map([...live, [key, allowed ? { ...current, count: current.count + 1 } : current]]);
    return allowed;
  }

  return { take, size: () => windows.size };
}
