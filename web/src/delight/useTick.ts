// Re-render every `ms` while `on` (ambient life follows the clock even when nothing else changes).
import { useEffect, useState } from 'react';

export function useTick(ms: number, on: boolean): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!on) return undefined;
    const timer = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(timer);
  }, [ms, on]);
  return n;
}
