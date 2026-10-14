// The "?" sheet: every keyboard shortcut in one place. A modal dialog; Esc (global) or the close button closes it.
import { type KeyboardEvent, useEffect, useRef } from 'react';

type Props = { paletteKey: string; singleKeys: boolean; onClose: () => void };
type Row = [keys: string[], what: string];

function groups(paletteKey: string, singleKeys: boolean): [string, Row[]][] {
  return [
    ['Anywhere', [
      [[paletteKey], 'Ask Pam: find anyone, any room, task or job'],
      ...(singleKeys ? [[['/'], 'Ask Pam'] as Row, [['?'], 'This sheet'] as Row] : []),
      [['Esc'], 'Close Ask Pam, this sheet, settings, or the top window'],
    ]],
    ['On the map', [
      [['Tab', '⇧ Tab'], 'Next / previous person or room, in reading order'],
      [['←', '→'], 'Previous / next'],
      [['↑', '↓'], 'The row above / below'],
      [['Home', 'End'], 'First / last'],
      [['Enter', 'Space'], 'Open their window'],
    ]],
    ['In Ask Pam', [
      [['↑', '↓'], 'Move through the results'],
      [['Enter'], 'Open'],
      [['⇧ Enter'], 'Show on the map'],
      [['s:error'], 'Only bots with that status (working, idle, meeting, error, offline, needs-you)'],
    ]],
  ];
}

export function ShortcutsSheet({ paletteKey, singleKeys, onClose }: Props) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => { close.current?.focus(); }, []);
  const trap = (e: KeyboardEvent) => { if (e.key === 'Tab') e.preventDefault(); };
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="shortcuts" role="dialog" aria-modal="true" aria-labelledby="shortcuts-title" onKeyDown={trap}>
        <header className="shortcuts-head">
          <h2 id="shortcuts-title">Keyboard shortcuts</h2>
          <button ref={close} type="button" className="win-btn shortcuts-close" aria-label="Close keyboard shortcuts" onClick={onClose}>×</button>
        </header>
        {groups(paletteKey, singleKeys).map(([title, rows]) => (
          <section key={title}>
            <h3>{title}</h3>
            <dl>
              {rows.map(([keys, what]) => (
                <div key={what} className="shortcut">
                  <dt>{keys.map((k, i) => <span key={k}>{i > 0 && ' '}<kbd>{k}</kbd></span>)}</dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </div>
  );
}
