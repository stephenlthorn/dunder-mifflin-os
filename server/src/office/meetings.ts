// Meetings from every adapter that has the `meetings` capability, with agent ids turned into the people at those
// desks (only here), free text scrubbed again on the way out, newest first. An adapter that fails reads as no
// meetings (logged), never as an error for the browser.
import type { Meeting, MinutesLine } from '../../../shared/contract.ts';
import type { AgentAdapter, AgentMeeting, Period } from '../adapters/types.ts';
import { scrubText } from '../domain/scrub.ts';
import { log, redact } from '../log.ts';
import type { Office } from './office.ts';
import type { Seating } from './seating.ts';

const MAX_MEETINGS = 100;

function composeLine(l: AgentMeeting['lines'][number], adapterId: string, seating: Seating): MinutesLine {
  const { authorAgentId, author, ...rest } = l;
  const personId = authorAgentId === undefined ? undefined : seating.personOf(adapterId, authorAgentId);
  const label = personId ? undefined : (author ?? authorAgentId);
  return { ...rest, text: scrubText(l.text), ...(personId ? { personId } : {}), ...(label ? { author: scrubText(label) } : {}) };
}

export function composeMeeting(m: AgentMeeting, adapterId: string, seating: Seating): Meeting {
  const { participantAgentIds, agenda, lines, ...rest } = m;
  const person = (agentId: string) => seating.personOf(adapterId, agentId);
  return {
    ...rest,
    id: `${adapterId}-${m.id}`,
    title: scrubText(m.title),
    participantIds: [...new Set(participantAgentIds.flatMap((a) => person(a) ?? []))],
    agenda: agenda.map(({ ownerAgentId, ...item }) => {
      const ownerId = ownerAgentId === undefined ? undefined : person(ownerAgentId);
      return { ...item, title: scrubText(item.title), ...(ownerId ? { ownerId } : {}) };
    }),
    lines: lines.map((l) => composeLine(l, adapterId, seating)),
  };
}

const valid = (m: AgentMeeting) => Number.isFinite(Date.parse(m.startedAt)) && (m.endedAt === undefined || Number.isFinite(Date.parse(m.endedAt)));

export function createOfficeMeetings(opts: { adapters: ReadonlyArray<AgentAdapter>; read: () => Promise<Office> }) {
  async function meetings(period: Period): Promise<Meeting[]> {
    const sources = opts.adapters.filter((a) => typeof a.meetings === 'function');
    if (sources.length === 0) return [];
    const { seating } = await opts.read();
    const lists = await Promise.all(sources.map(async (a) => {
      try {
        const list = (await a.meetings?.(period)) ?? [];
        return list.filter(valid).map((m) => composeMeeting(m, a.id, seating));
      } catch (error) {
        log('adapter.meetings_failed', { adapter: a.id, detail: redact(error instanceof Error ? error.message : String(error)) });
        return [];
      }
    }));
    return lists.flat().sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0)).slice(0, MAX_MEETINGS);
  }
  return { meetings };
}
