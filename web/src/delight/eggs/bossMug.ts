// Clicking the World's Best Boss mug on Michael's desk: the boss is you, so the mug says who is waiting on you.
import type { OfficeSnapshot } from '@shared/contract';
import { fleetCounts } from '../../office/status';
import { formatDuration } from '../dundies/awards';
import type { Toast } from './twss';

export function bossMugLine(s: OfficeSnapshot, now: number): Toast {
  const waiting = s.approvals ?? [];
  if (waiting.length) {
    const oldest = Math.min(...waiting.map((a) => Date.parse(a.requestedAt)).filter(Number.isFinite));
    const n = waiting.length;
    return { text: 'World’s Best Boss', sub: `${n} request${n === 1 ? ' waits' : 's wait'} for you at Toby’s desk; the oldest for ${formatDuration(now - oldest)}.` };
  }
  const c = fleetCounts(s.people, s.presence);
  const parts = [[c.working, 'working'], [c.meeting, 'in a meeting'], [c.error, 'with an error'], [c['needs-input'], 'needing you']] as const;
  const fleet = parts.filter(([n]) => n > 0).map(([n, w], i) => `${n}${i === 0 ? ` bot${n === 1 ? '' : 's'}` : ''} ${w}`);
  return { text: 'World’s Best Boss', sub: `Nobody is waiting on you.${fleet.length ? ` ${fleet.join(', ')}.` : ''}` };
}
