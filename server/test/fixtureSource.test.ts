import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { DEFAULT_FIXTURE, createFixtureSource, loadFixture, parseFixture, shiftState } from '../src/hermes/fixtureSource.ts';
import { buildSnapshot, roomChatsOf } from '../src/domain/snapshot.ts';
import { collectRoomMessages } from '../src/domain/roomMessages.ts';
import { loadPeople } from '../src/people.ts';

const fixture = loadFixture();
const T = Date.parse(fixture.state.recordedAt) / 1000;

describe('fixture file (recorded + redacted)', () => {
  const raw = readFileSync(DEFAULT_FIXTURE, 'utf8');

  it('has no chat ids, HMAC keys, paths, URLs or names of real people', () => {
    expect(raw).not.toMatch(/c_[0-9a-f]{16}/);
    expect(raw).not.toMatch(/\/Users\/|https?:\/\//);
    expect(raw).not.toMatch(/token|password/i);
    expect(raw).not.toMatch(/\[[A-Z][a-z]+ [A-Z][a-z]+\]/); // no "[First Last]" sender tags
    const longNumbers = raw.match(/-?\d{9,}/g) ?? [];
    for (const n of longNumbers) expect(Math.abs(Number(n) - T)).toBeLessThan(400 * 86_400); // only epoch timestamps
  });

  it('rejects malformed fixtures', () => {
    expect(() => parseFixture({ state: {} })).toThrow(/fixture/);
  });
});

describe('fixture adapter', () => {
  const source = createFixtureSource({ fixture });

  it('produces a snapshot that covers every status', async () => {
    const snap = buildSnapshot(await source.readState(), loadPeople(), T);
    expect(snap.people).toHaveLength(23);
    expect(snap.presence.michael).toMatchObject({ status: 'meeting', roomId: 'council' });
    expect(snap.presence.kelly).toMatchObject({ status: 'working', activity: 'Draft the Dundies recap post' });
    expect(snap.presence.andy).toMatchObject({ status: 'error', activity: 'Task crashed: Import the Skool member list' });
    expect(snap.presence.ira).toMatchObject({ status: 'offline' });
    expect(snap.presence.jim).toEqual({ status: 'no-bot' });
    expect(Object.values(snap.presence).filter((p) => p.status === 'no-bot')).toHaveLength(11);
    expect(snap.rooms.filter((r) => r.hermesRoom && r.kind !== 'dm').map((r) => r.id).sort())
      .toEqual(['content', 'council', 'hq', 'ops', 'outreach', 'rnd', 'skool']);
    expect(snap.jobs?.sadiq?.length).toBeGreaterThan(0);
    for (const j of Object.values(snap.jobs ?? {}).flat()) expect(`${j.name} ${j.schedule}`).not.toMatch(/\d{6,}/);
    expect(snap.tasks.find((t) => t.title === 'Restock the conference room paper')).toMatchObject({ status: 'todo', roomId: 'ops', shared: true, ownerId: 'dwight' });
  });

  it('serves synthetic room messages, council merged across bots', async () => {
    const state = await source.readState();
    const council = await collectRoomMessages(source, 'council', roomChatsOf(state), 50);
    expect(council.messages.map((m) => m.authorAgentId ?? 'user')).toEqual(['user', 'chief', 'cmo', 'cfo']);
    const ops = await collectRoomMessages(source, 'ops', roomChatsOf(state), 50);
    expect(ops.messages).toHaveLength(4);
    expect(ops.messages[2]).toMatchObject({ text: 'Who is on the paper pricing card?' });
    expect(ops.messages[2]).not.toHaveProperty('authorAgentId');
    expect(await collectRoomMessages(source, 'dm-health', roomChatsOf(state), 50)).toEqual({ messages: [], reason: 'not-in-fixture' });
  });

  it('time-shifts everything in demo mode so the recording stays "live"', async () => {
    const later = T + 86_400;
    const demo = createFixtureSource({ fixture, shift: true, now: () => later });
    const snap = buildSnapshot(await demo.readState(), loadPeople(), later);
    expect(snap.presence.kelly?.status).toBe('working');
    expect(snap.presence.michael?.status).toBe('meeting');
    expect(shiftState(fixture.state, 0)).toBe(fixture.state);
  });
});
