import { describe, expect, it } from 'vitest';
import { closeTop, closeWindow, focusWindow, moveWindow, openWindow, setPersonTab, toggleMinimize, topWindow, type WindowsState } from './windowState';

const empty: WindowsState = { windows: [], nextZ: 1 };

describe('window state', () => {
  it('opens a window on top and focuses an existing one instead of duplicating it', () => {
    let s = openWindow(empty, { kind: 'person', personId: 'dwight' });
    s = openWindow(s, { kind: 'area', areaId: 'conference' });
    expect(s.windows.map((w) => w.id)).toEqual(['person:dwight', 'area:conference']);
    expect(topWindow(s)!.id).toBe('area:conference');
    s = openWindow(s, { kind: 'person', personId: 'dwight' });
    expect(s.windows).toHaveLength(2);
    expect(topWindow(s)!.id).toBe('person:dwight');
  });

  it('cascades new windows so they do not stack exactly', () => {
    let s = openWindow(empty, { kind: 'person', personId: 'a' });
    s = openWindow(s, { kind: 'person', personId: 'b' });
    expect(s.windows[1].x).not.toBe(s.windows[0].x);
  });

  it('closes by id and closes the top window for Esc', () => {
    let s = openWindow(empty, { kind: 'person', personId: 'a' });
    s = openWindow(s, { kind: 'person', personId: 'b' });
    expect(closeTop(s).windows.map((w) => w.id)).toEqual(['person:a']);
    expect(closeWindow(s, 'person:a').windows.map((w) => w.id)).toEqual(['person:b']);
    expect(closeTop(empty)).toBe(empty);
  });

  it('moves, focuses and minimises without mutating', () => {
    const s = openWindow(openWindow(empty, { kind: 'person', personId: 'a' }), { kind: 'person', personId: 'b' });
    const moved = moveWindow(s, 'person:a', 300, 200);
    expect(moved.windows[0]).toMatchObject({ x: 300, y: 200 });
    expect(s.windows[0].x).not.toBe(300);
    const focused = focusWindow(s, 'person:a');
    expect(topWindow(focused)!.id).toBe('person:a');
    const min = toggleMinimize(focused, 'person:a');
    expect(min.windows[0].minimized).toBe(true);
    expect(topWindow(min)!.id).toBe('person:b');
  });

  it('remembers the selected room tab for an area window', () => {
    const s = openWindow(empty, { kind: 'area', areaId: 'conference', roomId: 'council' });
    expect(s.windows[0].ref).toEqual({ kind: 'area', areaId: 'conference', roomId: 'council' });
  });
});

describe('person tabs and the ledger window', () => {
  it('opens a person on a tab, keeps the tab when they are opened again without one, and switches it', () => {
    let s = openWindow(empty, { kind: 'person', personId: 'dwight', tab: 'timeline' });
    expect(s.windows[0]!.ref).toEqual({ kind: 'person', personId: 'dwight', tab: 'timeline' });
    s = openWindow(s, { kind: 'person', personId: 'dwight' });
    expect(s.windows[0]!.ref).toEqual({ kind: 'person', personId: 'dwight', tab: 'timeline' });
    s = setPersonTab(s, 'person:dwight', 'desk');
    expect(s.windows[0]!.ref).toEqual({ kind: 'person', personId: 'dwight', tab: 'desk' });
    expect(setPersonTab(s, 'nope', 'timeline')).toEqual(s);
  });

  it('has one ledger window', () => {
    let s = openWindow(empty, { kind: 'ledger' });
    s = openWindow(s, { kind: 'ledger' });
    expect(s.windows.map((w) => w.id)).toEqual(['ledger']);
  });
});
