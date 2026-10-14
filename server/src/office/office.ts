// The office as the browser sees it: every adapter's reading, seated by the rules, composed into one snapshot.
import { SEATS } from '../../../shared/office.ts';
import type { EpochSeconds } from '../hermes/types.ts';
import { KEEP_NAME_IDS, loadPeople, type BasePerson } from '../people.ts';
import { composeOffice, type AdapterReading, type Composed } from './compose.ts';
import { assignSeats, type MergedRules, type Seating } from './seating.ts';
import { unattributedOf } from './unattributed.ts';
import type { UnattributedItem } from '../../../shared/unattributed.ts';

export type OfficeSetup = {
  readonly rules: MergedRules;
  readonly people: ReadonlyArray<BasePerson>;
  readonly keepName: ReadonlySet<string>;
  readonly seatAreas: ReadonlyMap<string, string>; // seat id -> area id
  readonly spareSeatIds: ReadonlyArray<string>; // where temps sit, in order
};

/** `unattributed`: what no desk can hold (Creed's corner, GET /api/unattributed). */
export type Office = Composed & { readonly seating: Seating; readonly unattributed: ReadonlyArray<UnattributedItem> };

export function defaultOfficeSetup(rules: MergedRules): OfficeSetup {
  return {
    rules,
    people: loadPeople(),
    keepName: KEEP_NAME_IDS,
    seatAreas: new Map(SEATS.map((s) => [s.id, s.areaId])),
    spareSeatIds: SEATS.filter((s) => s.kind === 'spare').map((s) => s.id),
  };
}

export function buildOffice(readings: ReadonlyArray<AdapterReading>, setup: OfficeSetup, now: EpochSeconds): Office {
  const seating = assignSeats({
    rules: setup.rules,
    staffIds: setup.people.map((p) => p.id),
    spareSeatIds: setup.spareSeatIds,
    agents: readings.map((r) => ({ adapterId: r.adapter.id, agentIds: r.snapshot.agents.map((a) => a.id) })),
  });
  const composed = composeOffice(readings, seating, { people: setup.people, keepName: setup.keepName, seatAreas: setup.seatAreas, now });
  return { ...composed, seating, unattributed: unattributedOf(readings, seating) };
}
