// Which office character each agent becomes. Rules come from two places:
//  - the built-in seating (roster.ts: the Hermes bots at their Office desks). A built-in desk only gets its bot when
//    the adapter reports that agent, so the defaults never invent bots on someone else's machine;
//  - the user's config (`seats:` in ~/.dunder-mifflin-os/config.yaml). A configured desk is kept for its agent even
//    before the agent first reports (it shows as offline), and `null` leaves a desk without a bot.
// Agents no rule places become temps at the spare desks, in adapter order then agent order; the rest are reported
// as unseated. Pure: no I/O.

export type SeatRule = { readonly adapter: string; readonly agent: string; readonly role?: string };
export type SeatRules = Readonly<Record<string, SeatRule | null>>; // person id -> rule
export type MergedRule = SeatRule & { readonly hard: boolean };
export type MergedRules = Readonly<Record<string, MergedRule | null>>;

export type Seat = { readonly personId: string; readonly adapterId: string; readonly agentId: string; readonly role?: string };
export type TempSeat = Seat & { readonly seatId: string };
export type AgentRef = { readonly adapterId: string; readonly agentId: string };

export type Seating = {
  readonly staff: ReadonlyMap<string, Seat>; // person id -> seat, characters from the staff list
  readonly temps: ReadonlyArray<TempSeat>;
  readonly unseated: ReadonlyArray<AgentRef>;
  personOf(adapterId: string, agentId: string): string | undefined;
};

export type SeatingInput = {
  readonly rules: MergedRules;
  readonly staffIds: ReadonlyArray<string>;
  readonly spareSeatIds: ReadonlyArray<string>;
  readonly agents: ReadonlyArray<{ readonly adapterId: string; readonly agentIds: ReadonlyArray<string> }>; // adapters in config order
};

const keyOf = (adapterId: string, agentId: string): string => `${adapterId}/${agentId}`;

export const tempPersonId = (adapterId: string, agentId: string): string => `temp-${adapterId}-${agentId}`;

const withRole = (rule: SeatRule): SeatRule =>
  (rule.role === undefined ? { adapter: rule.adapter, agent: rule.agent } : { adapter: rule.adapter, agent: rule.agent, role: rule.role });

/** Config rules over the built-in ones. A configured agent leaves any built-in desk it had. */
export function mergeSeatRules(defaults: SeatRules, config: SeatRules): MergedRules {
  const moved = new Set(Object.values(config).flatMap((r) => (r ? [keyOf(r.adapter, r.agent)] : [])));
  const kept = Object.entries(defaults).flatMap(([personId, rule]): Array<[string, MergedRule]> =>
    (rule && !Object.hasOwn(config, personId) && !moved.has(keyOf(rule.adapter, rule.agent)) ? [[personId, { ...withRole(rule), hard: false }]] : []));
  const configured = Object.entries(config).map(([personId, rule]): [string, MergedRule | null] =>
    [personId, rule ? { ...withRole(rule), hard: true } : null]);
  return Object.freeze(Object.fromEntries([...kept, ...configured]));
}

function staffSeats(input: SeatingInput): Seat[] {
  const running = new Set(input.agents.map((a) => a.adapterId));
  const reported = new Set(input.agents.flatMap((a) => a.agentIds.map((id) => keyOf(a.adapterId, id))));
  return input.staffIds.reduce<Seat[]>((seats, personId) => {
    const rule = Object.hasOwn(input.rules, personId) ? input.rules[personId] : undefined;
    if (!rule || !running.has(rule.adapter)) return seats;
    const key = keyOf(rule.adapter, rule.agent);
    if (!rule.hard && !reported.has(key)) return seats;
    if (seats.some((s) => keyOf(s.adapterId, s.agentId) === key)) return seats;
    const seat: Seat = { personId, adapterId: rule.adapter, agentId: rule.agent, ...(rule.role === undefined ? {} : { role: rule.role }) };
    return [...seats, seat];
  }, []);
}

export function assignSeats(input: SeatingInput): Seating {
  const seats = staffSeats(input);
  const taken = new Set(seats.map((s) => keyOf(s.adapterId, s.agentId)));
  const waiting: AgentRef[] = input.agents.flatMap((a) =>
    a.agentIds.filter((id) => !taken.has(keyOf(a.adapterId, id))).map((agentId) => ({ adapterId: a.adapterId, agentId })));
  const temps: TempSeat[] = waiting.slice(0, input.spareSeatIds.length).map((ref, i) => ({
    personId: tempPersonId(ref.adapterId, ref.agentId), ...ref, seatId: input.spareSeatIds[i] ?? '',
  }));
  const byAgent = new Map([...seats, ...temps].map((s) => [keyOf(s.adapterId, s.agentId), s.personId]));
  return Object.freeze({
    staff: new Map(seats.map((s) => [s.personId, s])),
    temps: Object.freeze(temps),
    unseated: Object.freeze(waiting.slice(input.spareSeatIds.length)),
    personOf: (adapterId: string, agentId: string) => byAgent.get(keyOf(adapterId, agentId)),
  });
}
