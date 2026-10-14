// Listens for the Konami code anywhere outside a text field.
import { useEffect, useRef } from 'react';
import { konamiStep } from './konami';

const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export function useKonami(on: boolean, onCode: () => void): void {
  const progress = useRef(0);
  const fire = useRef(onCode);
  fire.current = onCode;
  useEffect(() => {
    if (!on) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (typing(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const step = konamiStep(progress.current, e.key);
      progress.current = step.progress;
      if (step.done) fire.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [on]);
}
