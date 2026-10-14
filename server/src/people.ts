// The office staff, from shared/office.ts (seats and looks are data there; move someone by editing it).
// Bot data (`bot`) is NOT taken from here: the snapshot overlays it from roster.ts + live Hermes personas.
import type { Person } from '../../shared/contract.ts';
import { STAFF, toPerson } from '../../shared/office.ts';

export type BasePerson = Omit<Person, 'bot'>;

function withoutBot(person: Person): BasePerson {
  const { bot: _bot, ...rest } = person;
  return Object.freeze({ ...rest, look: Object.freeze({ ...rest.look }) });
}

const PEOPLE: ReadonlyArray<BasePerson> = Object.freeze(STAFF.map((entry) => withoutBot(toPerson(entry))));

/** People whose map name wins over their bot's Hermes persona name (staff `keepName`). */
export const KEEP_NAME_IDS: ReadonlySet<string> = new Set(STAFF.filter((s) => s.keepName).map((s) => s.id));

export function loadPeople(): ReadonlyArray<BasePerson> {
  return PEOPLE;
}
