// Load something for a key (a period), keep showing the last value while the next one loads, reload on demand
// and, optionally, every `refreshMs`. Requests for an old key are aborted.
import { useCallback, useEffect, useState } from 'react';

export type Loaded<T> = { value: T | null; error: string | null; loading: boolean; reload: () => void };

export function useLoaded<T>(key: string, load: (signal: AbortSignal) => Promise<T>, refreshMs?: number): Loaded<T> {
  const [state, setState] = useState<{ value: T | null; error: string | null; loading: boolean }>({ value: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true }));
    load(ctrl.signal)
      .then((value) => { if (!ctrl.signal.aborted) setState({ value, error: null, loading: false }); })
      .catch((error: unknown) => {
        if (!ctrl.signal.aborted) setState((s) => ({ ...s, error: error instanceof Error ? error.message : String(error), loading: false }));
      });
    return () => ctrl.abort();
    // `load` is a fresh closure every render; the key says when it means something new
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick]);

  useEffect(() => {
    if (!refreshMs) return undefined;
    const t = setInterval(reload, refreshMs);
    return () => clearInterval(t);
  }, [refreshMs, reload]);

  return { ...state, reload };
}
