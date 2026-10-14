// One global keydown listener for the app's shortcuts (rules in hotkeys.ts).
import { useEffect, useRef } from 'react';
import type { Prefs } from '../prefs/prefs';
import { type HotkeyAction, type Overlay, hotkeyAction, isTypingTarget } from './hotkeys';

export function useHotkeys(overlay: Overlay, prefs: Prefs, handlers: Record<HotkeyAction, () => void>) {
  const latest = useRef({ overlay, prefs, handlers });
  latest.current = { overlay, prefs, handlers };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { overlay: o, prefs: p, handlers: h } = latest.current;
      const typing = isTypingTarget(document.activeElement);
      const action = hotkeyAction({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, shiftKey: e.shiftKey, typing }, { overlay: o, prefs: p });
      if (!action) return;
      if (action !== 'close-window') e.preventDefault();
      h[action]();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
