import { describe, expect, it } from 'vitest';
import { scrubText } from '../src/domain/scrub.ts';
import { buildSnapshot } from '../src/domain/snapshot.ts';
import { toAgentMessages } from '../src/domain/messages.ts';
import { loadPeople } from '../src/people.ts';
import type { HermesState } from '../src/hermes/types.ts';

describe('scrubText (free text leaving the server)', () => {
  it('replaces ~/.hermes paths, absolute or relative, with a placeholder', () => {
    expect(scrubText('Edited ~/.hermes/profiles/tech/config.yaml and restarted'))
      .toBe('Edited [hermes path] and restarted');
    expect(scrubText('see /Users/someone/.hermes/kanban.db.')).toBe('see [hermes path].');
    expect(scrubText('`$HOME/.hermes/cron/jobs.json`')).toBe('`[hermes path]`');
    expect(scrubText('in .hermes/logs')).toBe('in [hermes path]');
  });

  it('hides other home-directory paths behind ~', () => {
    expect(scrubText('repo at /Users/someone/GitHub/app')).toBe('repo at ~/GitHub/app');
    expect(scrubText('/home/bot/notes.md')).toBe('~/notes.md');
  });

  it('masks Telegram chat ids and other long digit runs', () => {
    expect(scrubText('posted to -1001234567890 at 9am')).toBe('posted to [id] at 9am');
    expect(scrubText('user 5550001234 asked')).toBe('user [id] asked');
    expect(scrubText('chat_id=-1001234567890')).toBe('chat_id=[id]');
  });

  it('masks phone numbers', () => {
    expect(scrubText('call +1 570 555 0123 today')).toBe('call [phone] today');
    expect(scrubText('call (570) 555-0123')).toBe('call [phone]');
    expect(scrubText('or 570.555.0123')).toBe('or [phone]');
  });

  it('masks tokens and API keys', () => {
    expect(scrubText('token 123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawz')).toBe('token [secret]');
    expect(scrubText('key sk-ant-api03-abcdefghijklmnopqrstuvwx')).toBe('key [secret]');
    expect(scrubText('Authorization: Bearer abcdefghijklmnop.qrstu')).toBe('Authorization: Bearer [secret]');
  });

  it('leaves ordinary text, times, money, versions and short numbers alone', () => {
    const plain = 'Q4 report: $12,500 by 2026-10-13 09:30, v1.2.3, 42 leads, 3 of 10 done, Hermes room #ops';
    expect(scrubText(plain)).toBe(plain);
  });
});

describe('free text is scrubbed wherever it leaves the server', () => {
  const NOW = 1_800_000_000;
  const iso = (s: number) => new Date(s * 1000).toISOString();
  const LEAKY = 'Check ~/.hermes/profiles/tech/config.yaml for -1001234567890';
  const CLEAN = 'Check [hermes path] for [id]';
  const state: HermesState = {
    recordedAt: iso(NOW),
    gateway: { running: true, platforms: [{ profile: 'campaigns', state: 'connected', errorCode: null, updatedAt: null },
      { profile: 'tech', state: 'connected', errorCode: null, updatedAt: null }] },
    telegram: [], chatNames: {},
    kanban: {
      tasks: [{ id: 't_1', title: LEAKY, assignee: 'campaigns', status: 'running', createdBy: null, tenant: null, createdAt: NOW - 60, startedAt: NOW - 60, completedAt: null, lastHeartbeatAt: NOW - 5 }],
      runs: [{ taskId: 't_1', profile: 'campaigns', status: 'running', outcome: null, startedAt: NOW - 60, endedAt: null, lastHeartbeatAt: NOW - 5 }],
      subs: [], links: [],
    },
    sessions: [{ profile: 'tech', lastActivityAt: NOW - 10, title: LEAKY, source: 'telegram' }],
    cron: [{ profile: 'tech', id: 'j1', name: LEAKY, enabled: true, schedule: '0 9 * * *', nextRunAt: null, lastRunAt: null, lastStatus: 'sent to +1 570 555 0123' }],
    personas: {},
  };
  const snap = buildSnapshot(state, loadPeople(), NOW);

  it('in task titles and the activity shown on the map', () => {
    expect(snap.tasks[0]?.title).toBe(CLEAN);
    expect(snap.presence.dwight?.activity).toBe(CLEAN);
    expect(snap.presence.sadiq?.activity).toBe(CLEAN);
  });

  it('in scheduled job names and statuses', () => {
    expect(snap.jobs?.sadiq?.[0]).toMatchObject({ name: CLEAN, lastStatus: 'sent to [phone]' });
  });

  it('in chat messages, from you and from bots', () => {
    const base = { profile: 'tech', at: NOW, origin: 'telegram' as const, platformMessageId: null };
    const msgs = toAgentMessages([
      { ...base, uid: 'a', role: 'user', text: `[Jan Levinson] ${LEAKY}` },
      { ...base, uid: 'b', role: 'assistant', text: `Done: /Users/someone/.hermes/kanban.db, call (570) 555-0123`, at: NOW + 1 },
    ], 'ops', 10);
    expect(msgs.map((m) => m.text)).toEqual([CLEAN, 'Done: [hermes path], call [phone]']);
  });
});

describe('scrubText is idempotent (the office scrubs adapter output a second time)', () => {
  it('leaves already-scrubbed text alone', () => {
    for (const text of ['Check ~/.hermes/profiles/tech/config.yaml for -1001234567890', 'Done: /Users/someone/.hermes/kanban.db, call (570) 555-0123', 'token sk-ant-abcdefghijklmnop1234 at ~/x', 'id -1001234567890']) {
      const once = scrubText(text);
      expect(scrubText(once)).toBe(once);
    }
  });
});
