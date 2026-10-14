// Fixed-window rate limiter for write endpoints (a local server, but a runaway client must not flood the board).
export function createRateLimiter(opts: { max: number; windowMs: number; clock?: () => number }) {
  const clock = opts.clock ?? Date.now;
  let window = { start: clock(), count: 0 };
  return {
    take(): boolean {
      const t = clock();
      if (t - window.start >= opts.windowMs) window = { start: t, count: 0 };
      if (window.count >= opts.max) return false;
      window = { ...window, count: window.count + 1 };
      return true;
    },
  };
}
