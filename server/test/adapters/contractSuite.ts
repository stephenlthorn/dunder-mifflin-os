// The contract every agent adapter must pass (src/adapters/types.ts). Each adapter's test file calls
// describeAdapterContract with a harness that builds the adapter and, for push adapters, feeds it events.
import { describe, expect, it } from 'vitest';
import type { AgentAdapter, InboundResponse } from '../../src/adapters/types.ts';
import { ADAPTER_ID, ADAPTER_KINDS, AGENT_ID, CAPABILITY_METHODS } from '../../src/adapters/types.ts';
import { LEAK_PATTERNS } from '../helpers/leakScan.ts';
import { TIMELINE_KINDS } from '../../../shared/observability.ts';

export type ContractHarness = {
  /** A fresh adapter. Its snapshot must already show at least one agent (feed it first if it starts empty). */
  make(): Promise<Fed>;
};
export type Fed = {
  readonly adapter: AgentAdapter;
  /** Push adapters: deliver one more change (a status change, a new message) through the adapter's real input path. */
  readonly feedMore?: () => Promise<void> | void;
  /** A bearer token the adapter's inbound routes accept. */
  readonly token?: string;
};

/** Free text an agent might send that must never reach the browser. Harnesses put these in every free-text field. */
export const DIRTY = Object.freeze({
  token: 'key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123',
  path: 'see /Users/jane.doe/secret-project/notes.md',
  hermes: 'read ~/.hermes/profiles/tech/config.yaml',
  phone: 'call +1 570 555 0123',
  chatId: 'chat -1001234567890',
  botToken: '123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawz',
});
export const DIRTY_TEXT = Object.values(DIRTY).join(' · ');

/** An inbound handler's answer when it must answer at once (only a held PermissionRequest answers later). */
export function answerNow(out: InboundResponse | Promise<InboundResponse>): InboundResponse {
  if (out instanceof Promise) throw new Error('expected an immediate answer, got a held request');
  return out;
}

const STATUSES = ['working', 'idle', 'offline', 'error', 'meeting', 'needs-input'];
const TASK_STATUSES = ['todo', 'doing', 'blocked', 'done'];
const ROOM_KINDS = ['ops', 'team', 'dm', 'common'];
const ROOM_ID = /^[a-z][a-z0-9-]{0,40}$/;
const isIso = (s: unknown) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(s) && !Number.isNaN(Date.parse(s));

function leaks(text: string): string[] {
  return LEAK_PATTERNS.filter(([, re]) => re.test(text)).map(([kind]) => kind);
}

export function describeAdapterContract(name: string, harness: ContractHarness): void {
  describe(`adapter contract: ${name}`, () => {
    it('declares an id, a kind, a label and every capability flag', async () => {
      const { adapter } = await harness.make();
      expect(adapter.id).toMatch(ADAPTER_ID);
      expect(ADAPTER_KINDS).toContain(adapter.kind);
      expect(adapter.label.length).toBeGreaterThan(0);
      expect(Object.keys(adapter.capabilities).sort()).toEqual(Object.keys(CAPABILITY_METHODS).sort());
      for (const flag of Object.values(adapter.capabilities)) expect(typeof flag).toBe('boolean');
    });

    it('has a method for every capability it declares, and none it does not', async () => {
      const { adapter } = await harness.make();
      for (const [flag, methods] of Object.entries(CAPABILITY_METHODS)) {
        const declared = adapter.capabilities[flag as keyof typeof CAPABILITY_METHODS];
        for (const m of methods) expect(typeof adapter[m] === 'function', `${flag} -> ${m}`).toBe(declared);
      }
    });

    it('reports a consistent roster with one valid presence per agent', async () => {
      const { adapter } = await harness.make();
      const snap = await adapter.snapshot();
      const ids = snap.agents.map((a) => a.id);
      expect(ids.length).toBeGreaterThan(0);
      expect(new Set(ids).size).toBe(ids.length);
      for (const a of snap.agents) {
        expect(a.id).toMatch(AGENT_ID);
        expect(typeof a.role).toBe('string');
      }
      expect(Object.keys(snap.presence).sort()).toEqual([...ids].sort());
      for (const p of Object.values(snap.presence)) {
        expect(STATUSES).toContain(p.status);
        if (p.since !== undefined) expect(isIso(p.since), p.since).toBe(true);
      }
    });

    it('keeps tasks and rooms consistent with its agents and the id rules', async () => {
      const { adapter } = await harness.make();
      const snap = await adapter.snapshot();
      const agents = new Set(snap.agents.map((a) => a.id));
      expect(new Set(snap.tasks.map((t) => t.id)).size).toBe(snap.tasks.length);
      for (const t of snap.tasks) {
        expect(TASK_STATUSES).toContain(t.status);
        expect(isIso(t.updatedAt), t.updatedAt).toBe(true);
        if (t.ownerAgentId !== undefined) expect(agents.has(t.ownerAgentId), t.ownerAgentId).toBe(true);
      }
      expect(new Set(snap.rooms.map((r) => r.id)).size).toBe(snap.rooms.length);
      for (const r of snap.rooms) {
        expect(r.id).toMatch(ROOM_ID);
        expect(ROOM_KINDS).toContain(r.kind);
        if (adapter.kind !== 'hermes') expect(r.id.startsWith(`${adapter.id}-`), r.id).toBe(true);
        for (const m of r.memberAgentIds) expect(agents.has(m), `${r.id}: ${m}`).toBe(true);
      }
      for (const [agentId] of Object.entries(snap.jobs ?? {})) expect(agents.has(agentId)).toBe(true);
    });

    it('answers for its own rooms only, with well-formed messages', async () => {
      const { adapter } = await harness.make();
      const snap = await adapter.snapshot();
      const agents = new Set(snap.agents.map((a) => a.id));
      expect(await adapter.readMessages('no-such-room-anywhere', 10)).toBeNull();
      for (const room of snap.rooms) {
        const page = await adapter.readMessages(room.id, 10);
        expect(page, room.id).not.toBeNull();
        expect(page!.messages.length).toBeLessThanOrEqual(10);
        for (const m of page!.messages) {
          expect(m.roomId).toBe(room.id);
          expect(isIso(m.at), m.at).toBe(true);
          if (m.authorAgentId !== undefined) expect(agents.has(m.authorAgentId)).toBe(true);
        }
      }
    });

    it('never lets a secret, chat id, phone number or home path out', async () => {
      const { adapter } = await harness.make();
      const snap = await adapter.snapshot();
      const pages = await Promise.all(snap.rooms.map((r) => adapter.readMessages(r.id, 50)));
      expect(leaks(JSON.stringify(snap))).toEqual([]);
      expect(leaks(JSON.stringify(pages))).toEqual([]);
    });

    it('meetings (optional): well-formed, its own agents only, nothing secret', async () => {
      const { adapter } = await harness.make();
      if (!adapter.meetings) return;
      const snap = await adapter.snapshot();
      const agents = new Set(snap.agents.map((a) => a.id));
      const list = await adapter.meetings({ from: 0, to: Date.now() / 1000 + 86_400 });
      expect(new Set(list.map((m) => m.id)).size).toBe(list.length);
      for (const m of list) {
        expect(['council', 'shared-task']).toContain(m.kind);
        expect(isIso(m.startedAt), m.startedAt).toBe(true);
        for (const a of m.participantAgentIds) expect(agents.has(a), `${m.id}: ${a}`).toBe(true);
        for (const l of m.lines) expect(isIso(l.at), l.at).toBe(true);
      }
      expect(leaks(JSON.stringify(list))).toEqual([]);
    });

    it('hands out snapshots that later changes never alter', async () => {
      const fed = await harness.make();
      const before = await fed.adapter.snapshot();
      const frozen = JSON.stringify(before);
      await fed.feedMore?.();
      const after = await fed.adapter.snapshot();
      expect(JSON.stringify(before)).toBe(frozen);
      if (fed.feedMore) expect(JSON.stringify(after)).not.toBe(frozen);
    });

    it('tells subscribers about changes until they unsubscribe', async () => {
      const fed = await harness.make();
      if (!fed.adapter.subscribe || !fed.feedMore) return;
      let calls = 0;
      const off = fed.adapter.subscribe(() => { calls += 1; });
      await fed.feedMore();
      expect(calls).toBeGreaterThan(0);
      off();
      const seen = calls;
      await fed.feedMore();
      expect(calls).toBe(seen);
    });

    it('offers a timeline (if any) of well-formed, scrubbed events, newest first, only for its own agents', async () => {
      const { adapter } = await harness.make();
      if (!adapter.timeline) return;
      const snap = await adapter.snapshot();
      const since = new Date(Date.parse('2000-01-01T00:00:00Z')).toISOString();
      expect(await adapter.timeline('no-such-agent-anywhere', { since, limit: 10 })).toBeNull();
      for (const a of snap.agents) {
        const events = await adapter.timeline(a.id, { since, limit: 50 });
        if (events === null) continue; // an agent may keep no timeline (e.g. a bot profile with no files)
        expect(events.length).toBeLessThanOrEqual(50);
        expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
        const times = events.map((e) => Date.parse(e.at));
        expect([...times].sort((x, y) => y - x)).toEqual(times);
        for (const e of events) {
          expect(TIMELINE_KINDS).toContain(e.kind);
          expect(isIso(e.at), e.at).toBe(true);
          expect(e.title.length).toBeGreaterThan(0);
          expect(e.title.length).toBeLessThanOrEqual(80);
          expect(e.title).not.toMatch(/[\r\n]/);
        }
        expect(leaks(JSON.stringify(events))).toEqual([]);
      }
    });

    it('reports usage (if any) as whole token counts per model, only for its own agents', async () => {
      const { adapter } = await harness.make();
      if (!adapter.usage) return;
      const window = { from: '2000-01-01T00:00:00.000Z', to: '2100-01-01T00:00:00.000Z' };
      expect(await adapter.usage('no-such-agent-anywhere', window)).toBeNull();
      for (const a of (await adapter.snapshot()).agents) {
        const usage = await adapter.usage(a.id, window);
        for (const m of usage?.models ?? []) {
          expect(m.model.length).toBeGreaterThan(0);
          for (const n of [m.inputTokens, m.outputTokens, m.cacheReadTokens, m.cacheWriteTokens]) expect(Number.isInteger(n) && n >= 0).toBe(true);
        }
      }
    });

    it('guards every inbound endpoint with the bearer token', async () => {
      const { adapter, token } = await harness.make();
      for (const route of adapter.routes ?? []) {
        expect(/^\^\\\/api\\\/(ingest|hooks)\\\//.test(route.pattern.source), route.pattern.source).toBe(true); // outside the cookie sign-in
        expect(route.authorize({})).toBe(false);
        expect(route.authorize({ authorization: 'Bearer wrong-token-wrong-token' })).toBe(false);
        expect(route.authorize({ authorization: `Bearer ${token ?? ''}` })).toBe(true);
      }
    });
  });
}
