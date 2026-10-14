// Shown while a fleet filter is on: what is shown, how many, and a way back to everyone.
import { FILTER_META, type FleetFilter } from '../office/filters';

type Props = { filter: FleetFilter; shown: number; bots: number; onClear: () => void };

export function FilterBar({ filter, shown, bots, onClear }: Props) {
  if (filter === 'all') return null;
  return (
    <div className="filter-bar">
      <span role="status">{FILTER_META[filter].only} · {shown} of {bots} bots</span>
      <button type="button" onClick={onClear}>Show everyone</button>
    </div>
  );
}
