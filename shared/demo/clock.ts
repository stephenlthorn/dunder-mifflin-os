// The demo's clock: office time runs at 1x, 10x or 60x real time and loops back to 08:30 at 17:30. A clock is an
// immutable value (speed + an anchor pairing a real instant with an office instant); changing speed makes a new
// anchor so office time never jumps. Pure; real time is always passed in.
import { DAY_MINUTES, DAY_START, DEMO_SPEEDS, DEMO_TITLE, type DemoSpeed, formatHm, isoAt, DAY_END } from './time';

const MINUTE_MS = 60_000;
const DAY_MS = DAY_MINUTES * MINUTE_MS;

export type DemoClock = {
  readonly speed: DemoSpeed;
  readonly anchorRealMs: number; // a real instant (epoch ms)...
  readonly anchorSimMs: number; // ...and the office time then, in ms since the first day's 08:30 (grows across loops)
};

/** What GET /api/demo/clock answers; a browser rebuilds the clock from `offsetMs` and `speed`. */
export type DemoClockView = {
  readonly title: string;
  readonly speed: DemoSpeed;
  readonly speeds: ReadonlyArray<DemoSpeed>;
  readonly time: string; // ISO office time now
  readonly offsetMs: number; // office ms since the first day's 08:30
  readonly day: number; // 0 for the first run through the day, 1 after the first loop, ...
  readonly start: string; // '08:30'
  readonly end: string; // '17:30'
};

export function startClock(realMs: number, startMinute: number, speed: DemoSpeed): DemoClock {
  return Object.freeze({ speed, anchorRealMs: realMs, anchorSimMs: (startMinute - DAY_START) * MINUTE_MS });
}

/** Office ms since the first day's 08:30, at a real instant. */
export function simMsAt(clock: DemoClock, realMs: number): number {
  return Math.max(0, clock.anchorSimMs + (realMs - clock.anchorRealMs) * clock.speed);
}

export const dayAt = (clock: DemoClock, realMs: number): number => Math.floor(simMsAt(clock, realMs) / DAY_MS);

/** The office minute (fractional, 510 = 08:30) at a real instant. */
export function minuteAt(clock: DemoClock, realMs: number): number {
  return DAY_START + (simMsAt(clock, realMs) % DAY_MS) / MINUTE_MS;
}

export function withSpeed(clock: DemoClock, speed: DemoSpeed, realMs: number): DemoClock {
  return Object.freeze({ speed, anchorRealMs: realMs, anchorSimMs: simMsAt(clock, realMs) });
}

/** The real instant at which the clock next shows `minute` (later today, or after the loop). */
export function realMsAtMinute(clock: DemoClock, realMs: number, minute: number): number {
  const now = simMsAt(clock, realMs);
  const dayStart = now - (now % DAY_MS);
  const target = dayStart + (minute - DAY_START) * MINUTE_MS;
  const next = target > now ? target : target + DAY_MS;
  return clock.anchorRealMs + (next - clock.anchorSimMs) / clock.speed;
}

export function clockView(clock: DemoClock, realMs: number): DemoClockView {
  return {
    title: DEMO_TITLE,
    speed: clock.speed,
    speeds: DEMO_SPEEDS,
    time: isoAt(minuteAt(clock, realMs)),
    offsetMs: simMsAt(clock, realMs),
    day: dayAt(clock, realMs),
    start: formatHm(DAY_START),
    end: formatHm(DAY_END),
  };
}
