// What the browser may do: in demo mode chat and new tasks are local echoes; live, the server decides (read-only default).
import type { OfficeState } from './useOffice';

export function writesAllowed(state: OfficeState): boolean {
  if (state.phase === 'demo') return true;
  if (state.phase === 'live') return state.snapshot.capabilities?.writes === true;
  return false;
}
