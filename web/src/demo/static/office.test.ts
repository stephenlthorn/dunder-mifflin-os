import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OfficeSnapshot } from '@shared/contract';
import { hm } from '@shared/demo/time';
import { createStaticOffice } from './office';

afterEach(() => vi.useRealTimers());

describe('the in-browser demo office (static demo)', () => {
  it('answers the office like the server would: the demo cast seated, everyone else without a bot', async () => {
    const office = createStaticOffice({ start: hm('10:45') });
    const res = await office.handle('GET', '/api/office', undefined);
    const snap = res.body as OfficeSnapshot;
    expect(res.status).toBe(200);
    expect(snap.capabilities).toEqual({ writes: true });
    expect(snap.adapters?.[0]).toMatchObject({ kind: 'demo', label: 'Demo' });
    expect(snap.people).toHaveLength(23);
    expect(snap.presence.michael).toMatchObject({ status: 'meeting', roomId: 'demo-council' });
    expect(snap.presence.jim).toEqual({ status: 'no-bot' });
  });

  it('serves room messages, the clock and its speed, and refuses what it does not know', async () => {
    const office = createStaticOffice({ start: hm('11:20'), speed: 10 });
    const council = await office.handle('GET', '/api/rooms/demo-council/messages', undefined);
    expect(council.status).toBe(200);
    expect((council.body as Array<{ authorId: string }>).map((m) => m.authorId)).toContain('michael');
    expect((await office.handle('GET', '/api/rooms/demo-rnd/messages', undefined)).headers).toEqual({ 'X-DMOS-Messages-Reason': 'Nothing said here yet today.' });
    expect((await office.handle('GET', '/api/demo/clock', undefined)).body).toMatchObject({ speed: 10 });
    expect((await office.handle('POST', '/api/demo/clock', { speed: 60 })).body).toMatchObject({ speed: 60 });
    expect((await office.handle('POST', '/api/demo/clock', { speed: 3 })).status).toBe(400);
    expect((await office.handle('GET', '/api/portraits/pam', undefined)).status).toBe(404);
    expect((await office.handle('POST', '/api/chat', 'not an object')).status).toBe(400);
    expect((await office.handle('DELETE', '/api/office', undefined)).status).toBe(405);
  });

  it('answers Creed\'s corner: the cards nobody owns', async () => {
    const office = createStaticOffice({ start: hm('11:05') });
    const res = await office.handle('GET', '/api/unattributed', undefined);
    expect(res.status).toBe(200);
    const items = (res.body as { items: Array<{ kind: string; title: string }> }).items;
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items.every((i) => i.kind === 'card')).toBe(true);
  });

  it('keeps a timeline per bot (the documentary crew, and what the Dundies count) and a scripted ledger', async () => {
    const office = createStaticOffice({ start: hm('12:30') });
    const since = new Date(Date.now() - 7 * 86_400_000).toISOString();
    const res = await office.handle('GET', '/api/people/dwight/timeline', undefined, `?since=${encodeURIComponent(since)}&limit=50`);
    expect(res.status).toBe(200);
    const t = res.body as { available: boolean; events: Array<{ kind: string }> };
    expect(t.available).toBe(true);
    expect(t.events.map((e) => e.kind)).toContain('task.finished');
    expect((await office.handle('GET', '/api/people/jim/timeline', undefined, '')).body).toMatchObject({ available: false });
    const usage = await office.handle('GET', '/api/usage', undefined, '?period=7d');
    expect(usage.status).toBe(200);
    const rows = (usage.body as { rows: Array<{ personId: string; usage: { cost: number | null; unpricedModels: string[] } | null }> }).rows;
    expect(rows.find((r) => r.personId === 'dwight')?.usage?.cost).toBeGreaterThan(0); // fictional estimates from the script
    expect(rows.find((r) => r.personId === 'kevin')?.usage).toMatchObject({ cost: null, unpricedModels: ['chili-7b-local'] });
    expect((await office.handle('GET', '/api/usage', undefined, '?period=forever')).status).toBe(400);
  });

  it('chats and creates tasks in memory', async () => {
    vi.useFakeTimers();
    const office = createStaticOffice({ start: hm('09:40') });
    const chat = office.handle('POST', '/api/chat', { roomId: 'demo-dm-frontdesk', text: 'Any messages?' });
    await vi.advanceTimersByTimeAsync(1000); // the bot "types" for a moment
    expect(await chat).toMatchObject({ status: 200, body: [{ authorId: 'pam' }] });
    const task = await office.handle('POST', '/api/tasks', { roomId: 'demo-ops', title: 'Water the plants', assignee: 'andy' });
    expect(task).toMatchObject({ status: 201, body: { ownerId: 'andy', status: 'todo' } });
  });

  it('streams the office: everything first, then changes as the day goes on', async () => {
    vi.useFakeTimers();
    const office = createStaticOffice({ start: hm('10:29'), speed: 60 });
    const updates: Array<{ presence?: Record<string, { status: string }> }> = [];
    const stop = office.events((u) => updates.push(u));
    await vi.advanceTimersByTimeAsync(10);
    expect(Object.keys(updates[0]?.presence ?? {})).toHaveLength(23);
    await vi.advanceTimersByTimeAsync(1500); // 10:30, the Council
    expect(updates.at(-1)?.presence?.michael?.status).toBe('meeting');
    stop();
  });

  it('takes control verbs in memory and shows the demo budgets', async () => {
    const office = createStaticOffice({ start: hm('16:45') });
    const run = await office.handle('POST', '/api/people/sadiq/actions', { action: 'run-job', args: { jobId: 'job-it-0' } });
    expect(run).toMatchObject({ status: 200, body: { ok: true, action: 'run-job', message: 'Fleet health check: running now.' } });
    expect((await office.handle('POST', '/api/people/sadiq/actions', { action: 'pause' })).status).toBe(501);
    expect((await office.handle('POST', '/api/people/jim/actions', { action: 'stop' })).status).toBe(404);
    const budgets = await office.handle('GET', '/api/budgets', undefined);
    expect(budgets.status).toBe(200);
    expect((budgets.body as { budgets: Array<{ personId: string; level: string }> }).budgets.find((b) => b.personId === 'kelly')).toMatchObject({ level: 'over' });
  });
});
