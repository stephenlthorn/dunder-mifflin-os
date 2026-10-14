// Keyboard navigation of the map: Tab / Shift+Tab and the arrow keys move between people and room signs in reading
// order (Home / End jump to the ends); Enter and Space open (handled by the targets). Tab past either end leaves the map.
import { type FocusEvent, type KeyboardEvent, type RefObject, useCallback, useEffect, useRef } from 'react';
import { type MapTarget, type NavMove, moveFocus } from './readingOrder';

const MOVES: Record<string, NavMove> = { ArrowRight: 'next', ArrowLeft: 'prev', ArrowDown: 'down', ArrowUp: 'up', Home: 'first', End: 'last' };
const TABBABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]';

/** `person:<id>` or `area:<id>` for a map target element (or anything inside one). */
export function targetKey(el: Element | null): string | null {
  const person = el?.closest('[data-person]')?.getAttribute('data-person');
  if (person) return `person:${person}`;
  const area = el?.closest('[data-area-sign][role="button"]')?.getAttribute('data-area-sign');
  return area ? `area:${area}` : null;
}

export function targetElement(root: Element | null, key: string): SVGElement | null {
  const [kind, id] = key.split(/:(.*)/s);
  const selector = kind === 'person' ? `[data-person="${CSS.escape(id)}"]` : `[data-area-sign="${CSS.escape(id)}"][role="button"]`;
  return root?.querySelector<SVGElement>(selector) ?? null;
}

/** Focus the nearest tabbable outside `root`, after it (dir 1) or before it (dir −1) in document order. */
function leave(root: Element, dir: 1 | -1) {
  const all = [...document.querySelectorAll<HTMLElement>(TABBABLE)].filter((el) =>
    !root.contains(el) && el.tabIndex >= 0 && el.getClientRects().length > 0);
  const flag = dir === 1 ? Node.DOCUMENT_POSITION_FOLLOWING : Node.DOCUMENT_POSITION_PRECEDING;
  const side = all.filter((el) => root.compareDocumentPosition(el) & flag);
  (dir === 1 ? side[0] : side[side.length - 1])?.focus();
}

export function useMapKeys(root: RefObject<SVGSVGElement | null>, rows: readonly MapTarget[][], ensureVisible: (el: Element) => void) {
  const viaTab = useRef<0 | 1 | -1>(0); // how focus is about to move: Tab (1), Shift+Tab (−1) or otherwise (0)

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => { viaTab.current = e.key === 'Tab' ? (e.shiftKey ? -1 : 1) : 0; };
    const onPointer = () => { viaTab.current = 0; };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, []);

  const focusKey = useCallback((key: string) => {
    const el = targetElement(root.current, key);
    el?.focus({ preventScroll: true });
  }, [root]);

  const onKeyDown = useCallback((e: KeyboardEvent) => {
    const current = targetKey(e.target as Element);
    const move = e.key === 'Tab' ? (e.shiftKey ? 'prev' : 'next') : MOVES[e.key];
    if (!current || !move || e.altKey || e.ctrlKey || e.metaKey) return;
    e.preventDefault();
    const next = moveFocus(rows, current, move);
    if (next) focusKey(next);
    else if (e.key === 'Tab' && root.current) leave(root.current, e.shiftKey ? -1 : 1);
  }, [rows, focusKey, root]);

  const onFocus = useCallback((e: FocusEvent) => {
    const key = targetKey(e.target as Element);
    if (!key) return;
    const from = e.relatedTarget as Node | null;
    const entering = !from || !root.current?.contains(from);
    if (entering && viaTab.current !== 0) {
      const want = moveFocus(rows, null, viaTab.current === 1 ? 'first' : 'last');
      viaTab.current = 0;
      if (want && want !== key) {
        focusKey(want);
        return;
      }
    }
    ensureVisible(e.target as Element);
  }, [rows, focusKey, root, ensureVisible]);

  return { onKeyDown, onFocus };
}
