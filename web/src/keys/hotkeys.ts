// Global keyboard shortcuts as a pure decision: which action a key press means, given what's open and the settings.
import type { Prefs } from '../prefs/prefs';

export type Overlay = 'palette' | 'shortcuts' | 'settings' | null;
export type HotkeyEvent = { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; typing: boolean };
export type HotkeyAction = 'toggle-palette' | 'open-palette' | 'toggle-shortcuts' | 'close-overlay' | 'close-window';
type Context = { overlay: Overlay; prefs: Pick<Prefs, 'paletteHotkey' | 'singleKeys'> };

export function hotkeyAction(e: HotkeyEvent, { overlay, prefs }: Context): HotkeyAction | null {
  if (e.key === 'Escape') return overlay ? 'close-overlay' : 'close-window';
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'k') return prefs.paletteHotkey ? 'toggle-palette' : null;
  if (e.typing || e.metaKey || e.ctrlKey || e.altKey || !prefs.singleKeys) return null;
  if (e.key === '/') return 'open-palette';
  if (e.key === '?') return 'toggle-shortcuts';
  return null;
}

const NOT_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color', 'file', 'image']);

/** True when keys typed now belong to a text field (so single-key shortcuts must stay out of the way). */
export function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  return el.tagName === 'INPUT' && !NOT_TEXT.has(((el as HTMLInputElement).type ?? 'text').toLowerCase());
}

export const isApple = (platform: string) => /mac|iphone|ipad|ipod/i.test(platform);
export const paletteKeyLabel = (platform: string): string => (isApple(platform) ? '⌘K' : 'Ctrl+K');
