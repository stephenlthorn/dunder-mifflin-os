// The Hermes bots of the example roster (docs/ARCHITECTURE.md): which profile keys exist, what each does, and the Office character
// each sits as by default (DEFAULT_SEATS; ~/.dunder-mifflin-os/config.yaml `seats:` can move them). Every Hermes
// whitelist (chat, headshots, tasks) is derived from this list.

export type RosterEntry = {
  readonly profile: string; // Hermes profile key, e.g. 'campaigns'
  readonly personId: string; // Person.id, e.g. 'dwight'
  readonly role: string; // what the bot does, shown in the UI
};

export const ROSTER: ReadonlyArray<RosterEntry> = Object.freeze([
  { profile: 'chief', personId: 'pam', role: 'Chief of staff: questions & handoffs' },
  { profile: 'cmo', personId: 'michael', role: 'Council: marketing (CMO)' },
  { profile: 'campaigns', personId: 'dwight', role: 'Campaigns & outreach' },
  { profile: 'cfo', personId: 'angela', role: 'Council: finance (CFO)' },
  { profile: 'teacher', personId: 'oscar', role: 'Teacher' },
  { profile: 'social', personId: 'kelly', role: 'Content manager' },
  { profile: 'skool', personId: 'andy', role: 'Skool community' },
  { profile: 'ai-strategist', personId: 'ryan', role: 'Council: AI strategy' },
  { profile: 'strategist', personId: 'david', role: 'Council: strategy' },
  { profile: 'tech', personId: 'sadiq', role: 'CTO: leads Ops and R&D' },
  { profile: 'general', personId: 'jarvis', role: 'General assistant' },
  { profile: 'health', personId: 'ira', role: 'Personal health' },
].map((e) => Object.freeze(e)));

const BY_PROFILE: ReadonlyMap<string, RosterEntry> = new Map(ROSTER.map((e) => [e.profile, e]));
const BY_PERSON: ReadonlyMap<string, RosterEntry> = new Map(ROSTER.map((e) => [e.personId, e]));

/** The built-in seating: each Hermes bot at its Office character's desk (config `seats:` overrides it). */
export const DEFAULT_SEATS: Readonly<Record<string, { readonly adapter: 'hermes'; readonly agent: string }>> = Object.freeze(
  Object.fromEntries(ROSTER.map((e) => [e.personId, Object.freeze({ adapter: 'hermes' as const, agent: e.profile })])),
);

export const BOT_PROFILES: ReadonlyArray<string> = Object.freeze(ROSTER.map((e) => e.profile));

export function isBotProfile(value: unknown): value is string {
  return typeof value === 'string' && BY_PROFILE.has(value);
}

export function rosterEntry(profile: string): RosterEntry | undefined {
  return BY_PROFILE.get(profile);
}

export function personForProfile(profile: string | null | undefined): string | undefined {
  return profile ? BY_PROFILE.get(profile)?.personId : undefined;
}

export function profileForPerson(personId: string | null | undefined): string | undefined {
  return personId ? BY_PERSON.get(personId)?.profile : undefined;
}
