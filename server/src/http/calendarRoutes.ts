// GET /api/schedule (the Party Planning Committee calendar) and GET /api/meetings (Conference Room minutes).
// Both read only, take an optional ?from&to period and sit behind sign-in like the rest of the API.
import type { MeetingsView, ScheduleView } from '../../../shared/contract.ts';
import { buildScheduleView } from '../../../shared/schedule/view.ts';
import type { OfficeService } from '../office/service.ts';
import type { EpochSeconds } from '../hermes/types.ts';
import { MEETINGS_PERIOD, SCHEDULE_PERIOD, parsePeriod } from './period.ts';

export type CalendarReply = { readonly status: number; readonly body: ScheduleView | MeetingsView | { error: string } };
export type CalendarDeps = {
  readonly office: Pick<OfficeService, 'read' | 'meetings'>;
  readonly now: () => EpochSeconds;
  readonly timeZone: string; // the zone jobs run in when their adapter doesn't say
};

export function createCalendarHandlers(deps: CalendarDeps) {
  async function schedule(url: URL): Promise<CalendarReply> {
    const nowMs = deps.now() * 1000;
    const period = parsePeriod(url.searchParams, nowMs, SCHEDULE_PERIOD);
    if (!period.ok) return { status: 400, body: { error: period.error } };
    const { snapshot } = await deps.office.read();
    const view = buildScheduleView({ jobs: snapshot.jobs ?? {}, span: period, now: nowMs, defaultTimeZone: deps.timeZone });
    return { status: 200, body: view };
  }

  async function meetings(url: URL): Promise<CalendarReply> {
    const nowMs = deps.now() * 1000;
    const period = parsePeriod(url.searchParams, nowMs, MEETINGS_PERIOD);
    if (!period.ok) return { status: 400, body: { error: period.error } };
    const list = await deps.office.meetings({ from: period.from / 1000, to: period.to / 1000 });
    const iso = (ms: number) => new Date(ms).toISOString();
    return { status: 200, body: { from: iso(period.from), to: iso(period.to), generatedAt: iso(nowMs), meetings: list } };
  }

  return { schedule, meetings };
}
