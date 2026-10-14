import type { WindowInfo } from './windows/windowState';

type Props = { windows: readonly WindowInfo[]; topId?: string; titleOf: (w: WindowInfo) => string; onActivate: (id: string) => void; hint?: string };

export function Taskbar({ windows, topId, titleOf, onActivate, hint = 'Click anyone on the map to open their window.' }: Props) {
  return (
    <nav className="taskbar" aria-label="Open windows">
      {windows.length === 0 && <span className="taskbar-hint">{hint}</span>}
      {windows.map((w) => (
        <button
          key={w.id}
          type="button"
          className={`task${w.id === topId ? ' is-active' : ''}${w.minimized ? ' is-min' : ''}`}
          aria-pressed={w.id === topId}
          onClick={() => onActivate(w.id)}
        >
          {titleOf(w)}
        </button>
      ))}
    </nav>
  );
}
