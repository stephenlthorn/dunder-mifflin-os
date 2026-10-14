// Window manager state for the OS chrome: open/focus/move/minimise/close, all immutable.

export type PersonTab = 'desk' | 'timeline';
export type WindowRef =
  | { kind: 'person'; personId: string; tab?: PersonTab }
  | { kind: 'area'; areaId: string; roomId?: string }
  | { kind: 'approvals' }
  | { kind: 'ledger' } // Angela's ledger: tokens and cost per bot
  | { kind: 'calendar' } // the Party Planning Committee calendar
  | { kind: 'dundies' } // the weekly awards (Weekly review in Toby mode)
  | { kind: 'creed' }; // Creed's corner: activity no desk can hold
export type WindowInfo = { id: string; ref: WindowRef; x: number; y: number; z: number; minimized: boolean };
export type WindowsState = { windows: readonly WindowInfo[]; nextZ: number };

export const INITIAL_WINDOWS: WindowsState = { windows: [], nextZ: 1 };
export const windowId = (ref: WindowRef) => (ref.kind === 'person' ? `person:${ref.personId}` : ref.kind === 'area' ? `area:${ref.areaId}` : ref.kind);
/** The Conference Room window's Minutes tab sits where a room id would (`{ kind: 'area', roomId: MINUTES_TAB }`). */
export const MINUTES_TAB = 'minutes';

/** Opening someone again without naming a tab keeps the tab their window is on. */
const nextRef = (old: WindowRef, ref: WindowRef): WindowRef =>
  (ref.kind === 'person' && old.kind === 'person' && ref.tab === undefined && old.tab ? { ...ref, tab: old.tab } : ref);

const CASCADE = 28;
const ORIGIN = { x: 96, y: 72 };

export function focusWindow(s: WindowsState, id: string): WindowsState {
  if (!s.windows.some((w) => w.id === id)) return s;
  return { nextZ: s.nextZ + 1, windows: s.windows.map((w) => (w.id === id ? { ...w, z: s.nextZ, minimized: false } : w)) };
}

export function openWindow(s: WindowsState, ref: WindowRef): WindowsState {
  const id = windowId(ref);
  if (s.windows.some((w) => w.id === id)) {
    const focused = focusWindow(s, id);
    return { ...focused, windows: focused.windows.map((w) => (w.id === id ? { ...w, ref: nextRef(w.ref, ref) } : w)) };
  }
  const offset = (s.windows.length % 8) * CASCADE;
  const win: WindowInfo = { id, ref, x: ORIGIN.x + offset, y: ORIGIN.y + offset, z: s.nextZ, minimized: false };
  return { nextZ: s.nextZ + 1, windows: [...s.windows, win] };
}

export const closeWindow = (s: WindowsState, id: string): WindowsState => ({ ...s, windows: s.windows.filter((w) => w.id !== id) });

export function topWindow(s: WindowsState): WindowInfo | undefined {
  return s.windows.filter((w) => !w.minimized).reduce<WindowInfo | undefined>((top, w) => (!top || w.z > top.z ? w : top), undefined);
}

export function closeTop(s: WindowsState): WindowsState {
  const top = topWindow(s);
  return top ? closeWindow(s, top.id) : s;
}

export const moveWindow = (s: WindowsState, id: string, x: number, y: number): WindowsState => ({
  ...s,
  windows: s.windows.map((w) => (w.id === id ? { ...w, x, y } : w)),
});

export function toggleMinimize(s: WindowsState, id: string): WindowsState {
  const win = s.windows.find((w) => w.id === id);
  if (!win) return s;
  if (win.minimized) return focusWindow(s, id);
  return { ...s, windows: s.windows.map((w) => (w.id === id ? { ...w, minimized: true } : w)) };
}

export function setAreaRoom(s: WindowsState, id: string, roomId: string): WindowsState {
  return {
    ...s,
    windows: s.windows.map((w) => (w.id === id && w.ref.kind === 'area' ? { ...w, ref: { ...w.ref, roomId } } : w)),
  };
}

export function setPersonTab(s: WindowsState, id: string, tab: PersonTab): WindowsState {
  return {
    ...s,
    windows: s.windows.map((w) => (w.id === id && w.ref.kind === 'person' ? { ...w, ref: { ...w.ref, tab } } : w)),
  };
}
