// The static demo's settings come from its address: ?speed=1|10|60, ?at=HH:MM (where the day starts), ?seed=N.
// Anything invalid is ignored (the defaults apply): a shared link can't break the page.
import { parseClockTime, parseSeed, parseSpeed, type DemoSpeed } from '@shared/demo/time';

export type StaticDemoOptions = { readonly speed?: DemoSpeed; readonly start?: number; readonly seed?: number };

export function readStaticOptions(search: string): StaticDemoOptions {
  const q = new URLSearchParams(search);
  const speed = parseSpeed(q.get('speed') ?? undefined);
  const start = parseClockTime(q.get('at') ?? undefined);
  const seed = parseSeed(q.get('seed') ?? undefined);
  return { ...(speed === null ? {} : { speed }), ...(start === null ? {} : { start }), ...(seed === null ? {} : { seed }) };
}
