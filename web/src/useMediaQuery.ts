// Track a CSS media query (phone width, reduced motion) as React state.
import { useEffect, useState } from 'react';

const matches = (query: string) => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches;

export function useMediaQuery(query: string): boolean {
  const [on, setOn] = useState(() => matches(query));
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const list = window.matchMedia(query);
    const update = () => setOn(list.matches);
    update();
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, [query]);
  return on;
}

export const NARROW_QUERY = '(max-width: 720px)';
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
