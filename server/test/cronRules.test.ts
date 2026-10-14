import { afterAll, describe, expect, it } from 'vitest';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseCronJobs, parseHermesTimeZone } from '../src/hermes/parseMisc.ts';
import { jobsByAgent } from '../src/domain/jobs.ts';
import { createLiveSource } from '../src/hermes/liveSource.ts';
import { createChatKeyer } from '../src/hermes/chatKey.ts';
import { T0, makeFakeHermesHome } from './helpers/fakeHermesHome.ts';

const base = { id: 'a1', name: 'Morning report', enabled: true, schedule_display: 'shown', next_run_at: null, last_run_at: null, last_status: null };

describe('parseCronJobs: the schedule rule', () => {
  it('keeps cron, interval and one-off rules from the schedule object', () => {
    const jobs = parseCronJobs('chief', {
      jobs: [
        { ...base, id: 'c', schedule: { kind: 'cron', expr: '30 5 * * 2,5', display: '30 5 * * 2,5' } },
        { ...base, id: 'i', schedule: { kind: 'interval', minutes: 30, display: 'every 30m' } },
        { ...base, id: 'o', schedule: { kind: 'once', run_at: '2026-10-13T10:00:00-04:00', display: 'once at 2026-10-13 10:00' } },
      ],
    });
    expect(jobs.map((j) => j.rule)).toEqual([
      { kind: 'cron', expr: '30 5 * * 2,5' },
      { kind: 'interval', minutes: 30 },
      { kind: 'once', at: '2026-10-13T10:00:00-04:00' },
    ]);
  });

  it('drops rules it cannot trust: bad cron, silly intervals, unknown kinds, free text', () => {
    const jobs = parseCronJobs('chief', {
      jobs: [
        { ...base, id: '1', schedule: { kind: 'cron', expr: 'rm -rf / ; 99 * * * *' } },
        { ...base, id: '2', schedule: { kind: 'interval', minutes: 0 } },
        { ...base, id: '3', schedule: { kind: 'interval', minutes: '30' } },
        { ...base, id: '4', schedule: { kind: 'webhook', url: 'https://example.com' } },
        { ...base, id: '5', schedule: { kind: 'once', run_at: 'call +1 570 555 0123 now' } },
        { ...base, id: '6', schedule: 'every 5m' },
      ],
    });
    expect(jobs).toHaveLength(6);
    for (const job of jobs) expect(job).not.toHaveProperty('rule');
  });

  it('tags every job with the profile time zone when there is one', () => {
    const [job] = parseCronJobs('chief', { jobs: [base] }, 'Europe/London');
    expect(job?.timeZone).toBe('Europe/London');
    expect(parseCronJobs('chief', { jobs: [base] })[0]).not.toHaveProperty('timeZone');
  });
});

describe('parseHermesTimeZone', () => {
  it('reads a valid IANA zone from config.yaml, and nothing else', () => {
    expect(parseHermesTimeZone({ timezone: 'America/Chicago', model: { default: 'x' } })).toBe('America/Chicago');
    expect(parseHermesTimeZone({ timezone: '' })).toBeNull(); // Hermes: empty = the machine's zone
    expect(parseHermesTimeZone({ timezone: 'Not/AZone' })).toBeNull();
    expect(parseHermesTimeZone({ timezone: 5 })).toBeNull();
    expect(parseHermesTimeZone(null)).toBeNull();
  });
});

describe('jobsByAgent carries the rule and zone to the office', () => {
  it('passes rule and timeZone through, still masking display text', () => {
    const [job] = parseCronJobs('tech', { jobs: [{ ...base, name: 'ping 1234567890', schedule: { kind: 'cron', expr: '0 9 * * *' } }] }, 'Asia/Tokyo');
    expect(jobsByAgent(job ? [job] : []).tech).toEqual([
      { id: 'joba1', name: 'ping [id]', schedule: 'shown', enabled: true, rule: { kind: 'cron', expr: '0 9 * * *' }, timeZone: 'Asia/Tokyo' },
    ]);
  });
});

describe('live source: zone from the profile config.yaml', async () => {
  const home = makeFakeHermesHome();
  afterAll(() => rmSync(home, { recursive: true, force: true }));
  const config = path.join(home, 'profiles', 'tech', 'config.yaml');
  const { readFileSync } = await import('node:fs');
  writeFileSync(config, `timezone: America/Denver\n${readFileSync(config, 'utf8')}`);
  writeFileSync(path.join(home, 'profiles', 'tech', 'cron', 'jobs.json'), JSON.stringify({
    jobs: [{ ...base, id: 'j1', name: 'ops-heartbeat', schedule: { kind: 'cron', expr: '0 9 * * *' }, prompt: 'PRIVATE' }],
  }));
  const state = await createLiveSource({ hermesHome: home, statusUrl: null, keyOf: createChatKeyer(Buffer.from('t')), now: () => T0 }).readState();

  it('reads the rule and the zone, and the telegram rooms still', () => {
    expect(state.cron).toEqual([expect.objectContaining({ name: 'ops-heartbeat', rule: { kind: 'cron', expr: '0 9 * * *' }, timeZone: 'America/Denver' })]);
    expect(state.telegram.find((t) => t.profile === 'tech')?.groupChats).toHaveLength(2);
    expect(JSON.stringify(state)).not.toContain('PRIVATE');
  });
});
