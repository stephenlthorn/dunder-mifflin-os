// The hermes adapter against the adapter contract, over the recorded fixture with secrets planted in every free-text field.
import { describe, expect, it } from 'vitest';
import { createHermesAdapter } from '../../src/adapters/hermes.ts';
import { createFixtureSource, loadFixture, type Fixture } from '../../src/hermes/fixtureSource.ts';
import type { Runner } from '../../src/chat/runner.ts';
import { DIRTY_TEXT, describeAdapterContract } from './contractSuite.ts';

const fixture = loadFixture();
const T = Date.parse(fixture.state.recordedAt) / 1000;
const runner: Runner = async (_file, args) => (args[0] === 'kanban'
  ? { stdout: JSON.stringify({ id: 't_new1', status: 'ready', created_at: T }), stderr: '', code: 0, timedOut: false }
  : { stdout: `On it. ${DIRTY_TEXT}\n`, stderr: '', code: 0, timedOut: false });

/** The fixture with secrets in task titles, session titles, persona names, job names and messages. */
function dirtyFixture(f: Fixture): Fixture {
  const s = f.state;
  return {
    ...f,
    state: {
      ...s,
      kanban: { ...s.kanban, tasks: s.kanban.tasks.map((t) => ({ ...t, title: `${t.title} ${DIRTY_TEXT}` })) },
      sessions: s.sessions.map((x) => ({ ...x, title: `${x.title ?? ''} ${DIRTY_TEXT}` })),
      personas: Object.fromEntries(Object.entries(s.personas).map(([k, v]) => [k, `${v} ${DIRTY_TEXT}`])),
      cron: s.cron.map((j) => ({ ...j, name: `${j.name} ${DIRTY_TEXT}` })),
    },
    messages: f.messages.map((e) => ({ ...e, messages: e.messages.map((m) => ({ ...m, text: `${m.text} ${DIRTY_TEXT}` })) })),
  };
}

const make = () => createHermesAdapter({ source: createFixtureSource({ fixture: dirtyFixture(fixture) }), runner, hermesBin: '/fake/hermes', now: () => T });

describeAdapterContract('hermes (recorded fixture)', { make: async () => ({ adapter: make() }) });

describe('hermes adapter', () => {
  it('lists the twelve roster bots by profile, named after their Hermes persona', async () => {
    const snap = await createHermesAdapter({ source: createFixtureSource({ fixture }), runner, hermesBin: 'h', now: () => T }).snapshot();
    expect(snap.agents).toHaveLength(12);
    expect(snap.agents.find((a) => a.id === 'campaigns')).toEqual({ id: 'campaigns', name: 'Dwight Schrute', role: 'Campaigns & outreach' });
    expect(snap.presence.cmo).toMatchObject({ status: 'meeting', roomId: 'council' });
  });

  it('chats and creates tasks in agent terms, scrubbing the reply', async () => {
    const adapter = make();
    const reply = await adapter.chat!('ops', 'status?');
    expect(reply).toMatchObject({ ok: true, value: [{ roomId: 'ops', authorAgentId: 'tech' }] });
    expect(JSON.stringify(reply)).not.toMatch(/sk-ant|\/Users\/|\+1 570/);
    const task = await adapter.createTask!({ roomId: 'ops', title: 'Restock paper', assigneeAgentId: 'campaigns' });
    expect(task).toMatchObject({ ok: true, value: { id: 't_new1', ownerAgentId: 'campaigns', roomId: 'ops', shared: true } });
  });
});
