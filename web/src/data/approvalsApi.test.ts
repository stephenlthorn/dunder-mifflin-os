import { afterEach, describe, expect, it, vi } from 'vitest';
import { decideApproval, interpretDecision } from './approvalsApi';

afterEach(() => vi.unstubAllGlobals());

describe('deciding an approval', () => {
  it('reads the answer: ok, refused with the server\'s reason, or a sign-in prompt', () => {
    expect(interpretDecision(200, { ok: true })).toEqual({ ok: true });
    expect(interpretDecision(403, { error: 'Read-only mode: …' })).toEqual({ ok: false, error: 'Read-only mode: …' });
    expect(interpretDecision(409, null)).toEqual({ ok: false, error: 'Request failed (409)' });
    expect(interpretDecision(401, { error: 'Sign in required' })).toEqual({ ok: false, error: 'Sign in again to decide (your session ended).' });
  });

  it('POSTs the decision and note as JSON to the approval\'s own URL', async () => {
    const calls: Array<[string, RequestInit]> = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
    });
    expect(await decideApproval('hermes:t_1.blocked', 'reject', '  not now ')).toEqual({ ok: true });
    expect(calls[0]?.[0]).toBe('/api/approvals/hermes%3At_1.blocked');
    expect(calls[0]?.[1]).toMatchObject({ method: 'POST', headers: { 'content-type': 'application/json' } });
    expect(JSON.parse(String(calls[0]?.[1].body))).toEqual({ decision: 'reject', note: 'not now' });
  });

  it('reports an unreachable server', async () => {
    vi.stubGlobal('fetch', async () => { throw new TypeError('Failed to fetch'); });
    expect(await decideApproval('hermes:t_1.blocked', 'approve', '')).toMatchObject({ ok: false, error: expect.stringMatching(/reach the server/) });
  });
});
