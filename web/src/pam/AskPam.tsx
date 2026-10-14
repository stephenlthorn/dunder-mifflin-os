// "Ask Pam": the ⌘K / Ctrl+K command palette. Pam at reception answers the phone. ARIA combobox + listbox
// (aria-activedescendant), keyboard-only: ↑↓ move, Enter opens, Shift+Enter shows on the map, Esc closes (global).
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { OfficeSnapshot } from '@shared/contract';
import { Portrait } from '../chrome/Portrait';
import type { PamItem } from './items';
import { PamOption } from './PamOption';
import { searchPam } from './search';

type Props = {
  snapshot: OfficeSnapshot;
  items: readonly PamItem[];
  recents: readonly string[];
  live: boolean;
  onRun: (item: PamItem, alt: boolean) => void;
  onClose: () => void;
};

const optionId = (i: number) => `pam-opt-${i}`;

export function AskPam({ snapshot, items, recents, live, onRun, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const sections = useMemo(() => searchPam(items, query, recents), [items, query, recents]);
  const flat = useMemo(() => sections.flatMap((s) => s.items), [sections]);
  const pam = snapshot.people.find((p) => p.id === 'pam');
  const current = flat[Math.min(active, flat.length - 1)];

  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => { setActive(0); }, [query]);
  useEffect(() => {
    document.getElementById(optionId(active))?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const n = flat.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (n) setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (current) onRun(current, e.shiftKey);
    } else if (e.key === 'Tab') {
      e.preventDefault(); // a modal: focus stays here
    }
  };

  let index = -1;
  return (
    <div className="pam-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pam" role="dialog" aria-modal="true" aria-label="Ask Pam">
        <div className="pam-head">
          {pam && <Portrait person={pam} live={live} size="sm" decorative />}
          <input
            ref={input}
            className="pam-input"
            role="combobox"
            aria-label="Ask Pam"
            aria-expanded="true"
            aria-controls="pam-list"
            aria-autocomplete="list"
            aria-activedescendant={current ? optionId(Math.min(active, flat.length - 1)) : undefined}
            placeholder="Dunder Mifflin, this is Pam…"
            autoComplete="off"
            spellCheck={false}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd className="pam-esc" aria-hidden="true">esc</kbd>
        </div>
        <div id="pam-list" className="pam-list" role="listbox" aria-label="Ask Pam results">
          {sections.map((section) => (
            <div key={section.id} role="group" aria-label={section.title}>
              {section.id !== 'results' && <div className="pam-section" aria-hidden="true">{section.title}</div>}
              {section.items.map((item) => {
                index += 1;
                const i = index;
                return (
                  <PamOption
                    key={`${section.id}-${item.id}`}
                    id={optionId(i)}
                    item={item}
                    snapshot={snapshot}
                    live={live}
                    selected={i === active}
                    onHover={() => setActive(i)}
                    onRun={(alt) => onRun(item, alt)}
                  />
                );
              })}
            </div>
          ))}
        </div>
        {flat.length === 0 && (
          <p className="pam-empty">Pam couldn’t find “{query.trim()}”. Try a name, a room, a task, a job or <code>s:error</code>.</p>
        )}
        <p className="sr-only" aria-live="polite">{query.trim() ? `${flat.length} result${flat.length === 1 ? '' : 's'}` : ''}</p>
        <div className="pam-foot" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> move</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>⇧</kbd><kbd>↵</kbd> show on the map</span>
          <span><kbd>s:</kbd> status, e.g. s:error</span>
        </div>
      </div>
    </div>
  );
}
