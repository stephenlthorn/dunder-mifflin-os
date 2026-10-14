// A few short-lived toasts (easter eggs, the boss mug): newest last, at most three, each gone after a few seconds.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Toast } from './eggs/twss';

export type ShownToast = Toast & { id: number };
const MAX = 3;
export const TOAST_MS = 6500;

export function useToasts(): { toasts: readonly ShownToast[]; push: (t: Toast) => void } {
  const [toasts, setToasts] = useState<readonly ShownToast[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => () => { for (const t of timers.current) clearTimeout(t); }, []);
  const push = useCallback((t: Toast) => {
    seq.current += 1;
    const id = seq.current;
    setToasts((list) => [...list, { ...t, id }].slice(-MAX));
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setToasts((list) => list.filter((x) => x.id !== id));
    }, TOAST_MS);
    timers.current.add(timer);
  }, []);
  return { toasts, push };
}
