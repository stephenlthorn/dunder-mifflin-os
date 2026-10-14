// Where the demo's bots sit: each at its character's desk (shared/demo/cast.ts). Merged over the built-in seating
// when a demo adapter runs, so Pam is the demo's front desk rather than a Hermes bot that isn't there.
import { DEMO_CAST } from '../../../../shared/demo/cast.ts';
import type { SeatRules } from '../../office/seating.ts';

export function demoSeatRules(adapterId: string): SeatRules {
  return Object.freeze(Object.fromEntries(DEMO_CAST.map((c) => [c.person, Object.freeze({ adapter: adapterId, agent: c.agent })])));
}
