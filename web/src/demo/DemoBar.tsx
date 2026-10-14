// The top bar while the office is the demo day: a "DEMO · Threat Level Midnight" badge (in place of Live/Demo), the
// office clock (in place of the real one) and the speed control: 1x, 10x, 60x.
import { useEffect, useState } from 'react';
import { formatOfficeTime, officeNowMs } from './demoClock';
import type { DemoDay } from './useDemoClock';
import '../styles/demo.css';

type Props = { day: DemoDay; writable: boolean };

const TICK_MS = 1000;

function OfficeClock({ day }: { day: DemoDay }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((n) => n + 1), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  const now = officeNowMs(day.clock, Date.now());
  const text = formatOfficeTime(now);
  return (
    <time className="clock demo-clock" data-testid="demo-clock" dateTime={new Date(now).toISOString()} title="Office time in the demo day">
      <span className="sr-only">Office time </span>{text}
    </time>
  );
}

export function DemoBar({ day, writable }: Props) {
  const why = writable ? undefined : 'This server is read-only, so the demo speed is fixed';
  return (
    <div className="demo-bar">
      <span className="source source-demo demo-badge" data-testid="demo-badge" title="A scripted, fictional day at the office. Nothing here is real.">
        DEMO<span className="demo-title"> · {day.view.title}</span>
      </span>
      <OfficeClock day={day} />
      <div className="demo-speed" role="group" aria-label="Demo speed" title={why ?? day.error ?? undefined}>
        {day.view.speeds.map((s) => (
          <button key={s} type="button" aria-pressed={s === day.view.speed} disabled={!writable} onClick={() => day.setSpeed(s)}>
            {s}×
          </button>
        ))}
      </div>
    </div>
  );
}
