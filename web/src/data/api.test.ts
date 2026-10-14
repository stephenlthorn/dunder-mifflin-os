import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { SignInRequiredError, demoEcho, fetchSnapshot, interpretChatResponse, interpretTaskResponse, isDemoRequested } from './api';

const msg = { id: 'm1', roomId: 'dm-campaigns', authorId: 'dwight', text: 'On it.', at: '2026-10-13T15:00:00.000Z' };

describe('interpretChatResponse', () => {
  it('returns the bot reply messages on 200', () => {
    expect(interpretChatResponse(200, [msg])).toEqual({ ok: true, messages: [msg] });
    expect(interpretChatResponse(200, [])).toEqual({ ok: true, messages: [] });
  });

  it('reports a busy bot on 429', () => {
    expect(interpretChatResponse(429, { error: 'busy' })).toEqual({ ok: false, busy: true, error: 'busy' });
  });

  it('surfaces server errors from { error }', () => {
    expect(interpretChatResponse(500, { error: 'hermes crashed' })).toEqual({ ok: false, busy: false, error: 'hermes crashed' });
    expect(interpretChatResponse(502, 'oops')).toEqual({ ok: false, busy: false, error: 'Request failed (502)' });
  });
});

describe('interpretTaskResponse', () => {
  it('accepts a created task on 201', () => {
    const task = { id: 't9', title: 'Ship it', status: 'todo', shared: true, roomId: 'ops', updatedAt: '2026-10-13T15:00:00.000Z' };
    expect(interpretTaskResponse(201, task)).toEqual({ ok: true, task });
  });
  it('reports errors', () => {
    expect(interpretTaskResponse(400, { error: 'title required' })).toEqual({ ok: false, error: 'title required' });
  });
});

describe('demoEcho', () => {
  it('returns the sent message and a local echo reply from the room lead', () => {
    const [mine, reply] = demoEcho('dm-campaigns', 'Status?', { id: 'dwight', name: 'Dwight Schrute' }, 1000);
    expect(mine).toMatchObject({ roomId: 'dm-campaigns', authorId: 'you', text: 'Status?' });
    expect(reply.authorId).toBe('dwight');
    expect(reply.text).toContain('Status?');
    expect(mine.id).not.toBe(reply.id);
  });
});

describe('isDemoRequested', () => {
  it('honours ?demo=1 and the demo build mode', () => {
    expect(isDemoRequested('?demo=1', 'development')).toBe(true);
    expect(isDemoRequested('', 'demo')).toBe(true);
    expect(isDemoRequested('?demo=0', 'development')).toBe(false);
  });
});

describe('fetchSnapshot', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('returns the parsed snapshot', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(DEMO_SNAPSHOT), { status: 200 })));
    expect((await fetchSnapshot()).people).toHaveLength(23);
  });

  it('throws SignInRequiredError on 401 so the app can send the browser to /login', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Sign in required' }), { status: 401 })));
    await expect(fetchSnapshot()).rejects.toBeInstanceOf(SignInRequiredError);
  });

  it('throws a plain error for other failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 500 })));
    const error = await fetchSnapshot().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(SignInRequiredError);
  });
});
