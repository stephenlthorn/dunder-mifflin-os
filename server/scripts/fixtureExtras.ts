// Synthetic additions to the recorded fixture: demo runs that exercise every status, and invented chat text.
// Nothing here comes from real Hermes messages.
import type { EpochSeconds, HermesState, RawMessage } from '../src/hermes/types.ts';
import type { FixtureMessages } from '../src/hermes/fixtureSource.ts';

export const AUGMENTED = [
  'cmo: running run on a council card (meeting in the Conference Room)',
  'social: running run with a fresh heartbeat (working)',
  'skool: run crashed 10 min before recording (error)',
  'health: telegram platform disconnected (offline)',
  'ops: a todo card created from Dunder Mifflin OS for campaigns (shared)',
];

export function augmentState(s: HermesState): HermesState {
  const t = Date.parse(s.recordedAt) / 1000;
  const task = (id: string, title: string, assignee: string, status: string, createdBy: string, startedAt: EpochSeconds | null) =>
    ({ id, title, assignee, status, createdBy, tenant: null, createdAt: t - 1800, startedAt, completedAt: null, lastHeartbeatAt: null });
  const run = (taskId: string, profile: string, status: string, outcome: string | null, startedAt: EpochSeconds, endedAt: EpochSeconds | null, hb: EpochSeconds | null) =>
    ({ taskId, profile, status, outcome, startedAt, endedAt, lastHeartbeatAt: hb });
  return {
    ...s,
    gateway: s.gateway && {
      ...s.gateway,
      platforms: s.gateway.platforms.map((p) => (p.profile === 'health' ? { ...p, state: 'disconnected' } : p)),
    },
    kanban: {
      ...s.kanban,
      tasks: [
        task('t_demo1', 'Council round: Q4 paper pricing', 'cmo', 'running', 'council', t - 600),
        task('t_demo2', 'Draft the Dundies recap post', 'social', 'running', 'user', t - 420),
        task('t_demo3', 'Import the Skool member list', 'skool', 'ready', 'user', null),
        task('t_demo4', 'Restock the conference room paper', 'campaigns', 'ready', 'dmos-ops', null),
        ...s.kanban.tasks,
      ],
      runs: [
        run('t_demo1', 'cmo', 'running', null, t - 600, null, t - 40),
        run('t_demo2', 'social', 'running', null, t - 420, null, t - 25),
        run('t_demo3', 'skool', 'crashed', 'crashed', t - 1500, t - 600, null),
        ...s.kanban.runs,
      ],
    },
  };
}

function thread(profile: string, target: string, t0: EpochSeconds, lines: ReadonlyArray<[('user' | 'assistant'), string]>): FixtureMessages {
  const messages: RawMessage[] = lines.map(([role, text], i) => ({
    uid: `fx-${profile}-${target.replace(/[^a-z0-9]/gi, '')}-${i + 1}`, profile, role, text, at: t0 + i * 90,
    origin: target.startsWith('os:') ? 'os' : 'telegram',
    platformMessageId: role === 'user' && !target.startsWith('os:') ? `fx-${target}-${i + 1}` : null,
  }));
  return { profile, target, messages };
}

export function syntheticMessages(recordedAt: string): FixtureMessages[] {
  const t = Date.parse(recordedAt) / 1000 - 6 * 3600;
  return [
    thread('tech', 'group:chat-ops', t, [['user', 'Morning. Anything on fire?'], ['assistant', 'Two cards running, nothing blocked. The copier jam is fixed.']]),
    thread('tech', 'os:dmos-ops', t + 3600, [['user', '[Ops room] Who is on the paper pricing card?'], ['assistant', 'Michael has it in the Council round; results by 9pm.']]),
    thread('chief', 'group:chat-council', t + 600, [['user', 'Council: should we raise prices 5%?'], ['assistant', 'Round 1 is running. Minutes follow tonight.']]),
    thread('cmo', 'group:chat-council', t + 700, [['assistant', 'Raise them. Nobody ever lost money by charging more for great paper.']]),
    thread('cfo', 'group:chat-council', t + 760, [['assistant', 'Margins support 3%, not 5%. Not known: competitor response.']]),
    thread('chief', 'group:chat-hq', t + 1200, [['user', 'What is waiting on me today?'], ['assistant', 'Two approvals: the Dundies budget and the warehouse rota.']]),
    thread('social', 'group:chat-content', t + 1800, [['user', 'Post ideas for this week?'], ['assistant', 'Three drafts queued: Dundies recap, paper facts, a Scranton shout-out.']]),
    thread('campaigns', 'group:chat-outreach', t + 2400, [['user', 'How did the paper mailer do?'], ['assistant', 'Fact: 40 sent, 5 replies, 1 meeting. Bears were not involved.']]),
    thread('skool', 'group:chat-skool', t + 3000, [['user', 'New members this week?'], ['assistant', 'Twelve new members. Rit dit dit di doo.']]),
    thread('tech', 'group:chat-rnd', t + 4200, [['user', 'Try the new local model?'], ['assistant', 'Benchmarked it: faster, slightly worse at tool calls. Write-up in the card.']]),
    thread('general', 'dm', t + 5000, [['user', 'Remind me what is on tomorrow.'], ['assistant', 'Two meetings and the weekly review at 4pm, sir.']]),
  ];
}
