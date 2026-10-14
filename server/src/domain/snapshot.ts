// HermesState + clock -> the Hermes adapter's snapshot (agents keyed by profile). Pure: no I/O, no chat keys in
// the output. buildSnapshot() composes it into an OfficeSnapshot with the built-in seating, for scripts and tests.
import type { OfficeSnapshot, Presence } from '../../../shared/contract.ts';
import type { AdapterSnapshot, AgentInfo } from '../adapters/types.ts';
import type { EpochSeconds, HermesState, RoomChat } from '../hermes/types.ts';
import { hermesRooms } from '../rooms.ts';
import { BOT_PROFILES, DEFAULT_SEATS, rosterEntry } from '../roster.ts';
import { deriveRoomChats } from './roomChats.ts';
import { annotateTasks, runsForProfile, toAgentTasks } from './tasks.ts';
import { derivePresence } from './presence.ts';
import { jobsByAgent } from './jobs.ts';
import { scrubText } from './scrub.ts';
import type { BasePerson } from '../people.ts';
import { buildOffice, defaultOfficeSetup } from '../office/office.ts';
import { mergeSeatRules } from '../office/seating.ts';
import { HERMES_SUMMARY } from './hermesSummary.ts';
import { hermesApprovals } from './hermesApprovals.ts';

export function roomChatsOf(state: HermesState): RoomChat[] {
  return deriveRoomChats(state.telegram, state.chatNames);
}

/** Roster from roster.ts; the display name is the bot's Hermes persona, when it has one. */
function agentsOf(state: HermesState): AgentInfo[] {
  return BOT_PROFILES.map((profile): AgentInfo => {
    const role = rosterEntry(profile)?.role ?? 'Hermes agent';
    const persona = state.personas[profile];
    return persona ? { id: profile, name: scrubText(persona), role } : { id: profile, role };
  });
}

export function buildHermesSnapshot(state: HermesState, now: EpochSeconds): AdapterSnapshot {
  const roomChats = roomChatsOf(state);
  const infos = annotateTasks(state.kanban, roomChats);
  const presence = Object.fromEntries(BOT_PROFILES.map((profile): [string, Presence] => [profile, derivePresence({
    now,
    gatewayRunning: state.gateway ? state.gateway.running : null,
    platform: state.gateway?.platforms.find((x) => x.profile === profile),
    runs: runsForProfile(infos, state.kanban.runs, profile),
    session: state.sessions.find((s) => s.profile === profile),
    cron: state.cron.filter((j) => j.profile === profile),
  })]));
  return {
    agents: agentsOf(state), presence, tasks: toAgentTasks(infos, now), rooms: hermesRooms(roomChats), jobs: jobsByAgent(state.cron),
    approvals: hermesApprovals(state.kanban.waiting ?? []),
  };
}

/** The office as the Hermes adapter alone sees it, every bot at its built-in desk. */
export function buildSnapshot(state: HermesState, people: ReadonlyArray<BasePerson>, now: EpochSeconds): OfficeSnapshot {
  const setup = { ...defaultOfficeSetup(mergeSeatRules(DEFAULT_SEATS, {})), people };
  return buildOffice([{ adapter: HERMES_SUMMARY, snapshot: buildHermesSnapshot(state, now) }], setup, now).snapshot;
}
