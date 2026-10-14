// Coalesces Hermes reads: concurrent callers share one read, and a reading is reused for `ttlMs`.
import type { HermesSource, HermesState } from '../hermes/types.ts';

export function createStateCache(source: HermesSource, ttlMs: number, clock: () => number = Date.now) {
  let cached: { at: number; state: HermesState } | null = null;
  let inflight: Promise<HermesState> | null = null;

  async function get(): Promise<HermesState> {
    if (cached && clock() - cached.at < ttlMs) return cached.state;
    inflight ??= source.readState()
      .then((state) => {
        cached = { at: clock(), state };
        return state;
      })
      .finally(() => { inflight = null; });
    return inflight;
  }

  return { get, invalidate: (): void => { cached = null; } };
}
