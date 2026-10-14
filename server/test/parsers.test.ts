import { describe, expect, it } from 'vitest';
import { parseGatewayFile, parseStatusApi } from '../src/hermes/parseGateway.ts';
import { extractRoomHint, parseTelegramConfig } from '../src/hermes/parseTelegram.ts';
import { parseCronJobs, parsePersonas } from '../src/hermes/parseMisc.ts';
import { createChatKeyer } from '../src/hermes/chatKey.ts';

const platform = (state: string, error_code: string | null = null) => ({
  state, error_code, error_message: error_code ? 'secret-ish detail bot123:ABC' : null, updated_at: '2026-10-13T01:12:17+00:00',
});

describe('parseGatewayFile (gateway_state.json)', () => {
  const file = {
    pid: 4242, gateway_state: 'running', active_agents: 0,
    platforms: { herald: platform('connected'), 'tech:telegram': platform('connected'), 'cmo:telegram': platform('fatal', 'telegram_conflict'), 'general:discord': platform('connected') },
  };

  it('keeps only <profile>:telegram platforms and never the error message', () => {
    const g = parseGatewayFile(file, () => true);
    expect(g?.running).toBe(true);
    expect(g?.platforms).toEqual([
      { profile: 'tech', state: 'connected', errorCode: null, updatedAt: '2026-10-13T01:12:17+00:00' },
      { profile: 'cmo', state: 'fatal', errorCode: 'telegram_conflict', updatedAt: '2026-10-13T01:12:17+00:00' },
    ]);
    expect(JSON.stringify(g)).not.toContain('bot123');
  });

  it('is not running when the recorded pid is dead or the state is not running', () => {
    expect(parseGatewayFile(file, () => false)?.running).toBe(false);
    expect(parseGatewayFile({ ...file, gateway_state: 'stopped' }, () => true)?.running).toBe(false);
  });

  it('rejects malformed input', () => {
    expect(parseGatewayFile(null, () => true)).toBeNull();
    expect(parseGatewayFile({ platforms: 'nope' }, () => true)).toBeNull();
    expect(parseGatewayFile({ gateway_state: 'running', platforms: { '../x:telegram': platform('connected') } }, () => true)?.platforms).toEqual([]);
  });
});

describe('parseStatusApi (GET :9119/api/status)', () => {
  it('reads gateway_running and gateway_platforms', () => {
    const g = parseStatusApi({ gateway_running: true, gateway_state: 'running', gateway_platforms: { 'skool:telegram': platform('connected') } });
    expect(g).toEqual({ running: true, platforms: [{ profile: 'skool', state: 'connected', errorCode: null, updatedAt: '2026-10-13T01:12:17+00:00' }] });
  });

  it('returns null without a platforms object', () => {
    expect(parseStatusApi({ gateway_running: true })).toBeNull();
    expect(parseStatusApi('<html>')).toBeNull();
  });
});

describe('extractRoomHint (channel prompt -> room name)', () => {
  const header = 'Team group rules. Rooms and their leads: HQ = chief; Content = social; Ops = tech.';
  it('reads the room from the room-specific paragraph, not the shared header', () => {
    expect(extractRoomHint(`${header}\n\nYou lead the Ops room. Jan's messages here come to you first.`)).toBe('Ops');
    expect(extractRoomHint(`${header}\n\nYou chair the Council room.`)).toBe('Council');
    expect(extractRoomHint(`${header}\n\nYou are a council advisor in the Council room.`)).toBe('Council');
    expect(extractRoomHint('This is the R&D room; tech leads it.')).toBe('R&D');
  });

  it('returns null when no known room is named', () => {
    expect(extractRoomHint(`${header}\n\nBe nice.`)).toBeNull();
    expect(extractRoomHint('')).toBeNull();
  });
});

describe('parseTelegramConfig (config.yaml, telegram room fields only)', () => {
  const keyOf = (raw: unknown) => `k(${String(raw)})`;
  const doc = {
    model: { default: 'x' }, basic_auth: { password: 'hunter2' },
    platforms: {
      telegram: {
        enabled: true, require_mention: true,
        group_allowed_chats: [-1001, '-1002'], free_response_chats: [-1001],
        channel_prompts: { '-1001': 'Rules.\n\nYou lead the Ops room.', '-1002': 'Rules.\n\nYou are the CTO on the council in the Council room.' },
        home_channel: { chat_id: 555, name: 'Jan Levinson' },
      },
    },
  };

  it('keeps chat keys and room hints, nothing else', () => {
    const cfg = parseTelegramConfig('tech', doc, keyOf);
    expect(cfg).toEqual({
      profile: 'tech', enabled: true,
      groupChats: ['k(-1001)', 'k(-1002)'], leadChats: ['k(-1001)'],
      roomHints: { 'k(-1001)': 'Ops', 'k(-1002)': 'Council' },
    });
    expect(JSON.stringify(cfg)).not.toMatch(/hunter2|555|Jan Levinson/);
  });

  it('copes with a profile that has no telegram groups', () => {
    expect(parseTelegramConfig('teacher', { platforms: { telegram: { enabled: true } } }, keyOf))
      .toEqual({ profile: 'teacher', enabled: true, groupChats: [], leadChats: [], roomHints: {} });
    expect(parseTelegramConfig('x', 'garbage', keyOf).enabled).toBe(false);
  });
});

describe('parseCronJobs / parsePersonas', () => {
  it('keeps display fields of cron jobs only (no prompt, script, origin)', () => {
    const jobs = parseCronJobs('tech', {
      jobs: [
        { id: 'abc', name: 'ops-heartbeat', enabled: true, schedule_display: '0 9 * * *', next_run_at: '2026-10-14T09:00:00-04:00', last_run_at: null, last_status: 'ok', prompt: 'SECRET PROMPT', origin: { chat_id: 1 } },
        { name: 'missing id' },
      ],
    });
    expect(jobs).toEqual([{ profile: 'tech', id: 'abc', name: 'ops-heartbeat', enabled: true, schedule: '0 9 * * *', nextRunAt: '2026-10-14T09:00:00-04:00', lastRunAt: null, lastStatus: 'ok' }]);
    expect(parseCronJobs('tech', [])).toEqual([]);
  });

  it('maps persona character names by profile', () => {
    expect(parsePersonas({ chief: { character: 'Pam Beesly', voice: 'long text' }, bad: 'x', '../x': { character: 'X' } }))
      .toEqual({ chief: 'Pam Beesly' });
    expect(parsePersonas(null)).toEqual({});
  });
});

describe('createChatKeyer', () => {
  it('maps the same chat id (number or string) to the same opaque key', () => {
    const key = createChatKeyer(Buffer.from('test-secret'));
    expect(key(-1001234567890)).toBe(key('-1001234567890'));
    expect(key(-1001234567890n)).toBe(key('-1001234567890'));
    expect(key('-1001234567890')).toMatch(/^c_[0-9a-f]{16}$/);
    expect(key('-1001234567890')).not.toContain('1001234567890');
    expect(key('1')).not.toBe(key('2'));
  });

  it('differs between secrets (keys are not stable across restarts)', () => {
    expect(createChatKeyer(Buffer.from('a'))('5')).not.toBe(createChatKeyer(Buffer.from('b'))('5'));
  });
});
