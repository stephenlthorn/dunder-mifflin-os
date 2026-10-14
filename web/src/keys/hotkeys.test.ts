import { describe, expect, it } from 'vitest';
import { DEFAULT_PREFS } from '../prefs/prefs';
import { type HotkeyEvent, hotkeyAction, isTypingTarget, paletteKeyLabel } from './hotkeys';

const key = (k: string, mods: Partial<HotkeyEvent> = {}): HotkeyEvent =>
  ({ key: k, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, typing: false, ...mods });
const ctx = (overlay: 'palette' | 'shortcuts' | 'settings' | null = null, prefs = DEFAULT_PREFS) => ({ overlay, prefs });

describe('hotkeyAction', () => {
  it('⌘K and Ctrl+K toggle Ask Pam, even while typing', () => {
    expect(hotkeyAction(key('k', { metaKey: true }), ctx())).toBe('toggle-palette');
    expect(hotkeyAction(key('K', { ctrlKey: true, typing: true }), ctx())).toBe('toggle-palette');
    expect(hotkeyAction(key('k', { ctrlKey: true, altKey: true }), ctx())).toBeNull();
    expect(hotkeyAction(key('k'), ctx())).toBeNull();
  });

  it('"/" opens Ask Pam and "?" toggles the shortcuts sheet, but not while typing', () => {
    expect(hotkeyAction(key('/'), ctx())).toBe('open-palette');
    expect(hotkeyAction(key('?', { shiftKey: true }), ctx())).toBe('toggle-shortcuts');
    expect(hotkeyAction(key('?', { shiftKey: true }), ctx('shortcuts'))).toBe('toggle-shortcuts');
    expect(hotkeyAction(key('/', { typing: true }), ctx())).toBeNull();
    expect(hotkeyAction(key('?', { typing: true }), ctx())).toBeNull();
  });

  it('Esc closes the open overlay first, otherwise the top window', () => {
    expect(hotkeyAction(key('Escape'), ctx('palette'))).toBe('close-overlay');
    expect(hotkeyAction(key('Escape', { typing: true }), ctx('settings'))).toBe('close-overlay');
    expect(hotkeyAction(key('Escape'), ctx())).toBe('close-window');
  });

  it('respects the settings: the palette hotkey and single-key shortcuts can be turned off', () => {
    const off = { ...DEFAULT_PREFS, paletteHotkey: false, singleKeys: false };
    expect(hotkeyAction(key('k', { metaKey: true }), ctx(null, off))).toBeNull();
    expect(hotkeyAction(key('/'), ctx(null, off))).toBeNull();
    expect(hotkeyAction(key('?'), ctx(null, off))).toBeNull();
    expect(hotkeyAction(key('Escape'), ctx(null, off))).toBe('close-window');
  });
});

describe('isTypingTarget', () => {
  const el = (tagName: string, extra: Record<string, unknown> = {}) => ({ tagName, isContentEditable: false, ...extra }) as unknown as Element;
  it('is true for text fields, selects and editable content, not for buttons or checkboxes', () => {
    expect(isTypingTarget(el('INPUT', { type: 'text' }))).toBe(true);
    expect(isTypingTarget(el('TEXTAREA'))).toBe(true);
    expect(isTypingTarget(el('SELECT'))).toBe(true);
    expect(isTypingTarget(el('DIV', { isContentEditable: true }))).toBe(true);
    expect(isTypingTarget(el('INPUT', { type: 'checkbox' }))).toBe(false);
    expect(isTypingTarget(el('BUTTON'))).toBe(false);
    expect(isTypingTarget(null)).toBe(false);
  });
});

describe('paletteKeyLabel', () => {
  it('shows ⌘K on Apple platforms and Ctrl+K elsewhere', () => {
    expect(paletteKeyLabel('MacIntel')).toBe('⌘K');
    expect(paletteKeyLabel('iPhone')).toBe('⌘K');
    expect(paletteKeyLabel('Win32')).toBe('Ctrl+K');
    expect(paletteKeyLabel('Linux x86_64')).toBe('Ctrl+K');
  });
});
