import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { AgentCapabilities, Person } from '@shared/contract';
import type { BudgetStatus } from '@shared/controls';
import { DEMO_NOW, DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { withDemoControls } from '../../budgets/demoCorporate';
import type { ControlFlow } from '../../office/controlFlow';
import { offeredControls } from '../../office/controls';
import { ControlsPanel } from './ControlsPanel';
import { PersonWindow } from './PersonWindow';
import type { Controls } from './useControls';

const DEMO = withDemoControls(DEMO_SNAPSHOT);
const WEBHOOK: AgentCapabilities = { chat: false, createTask: false, approvals: true, pause: true, stop: true, runJob: false, reassign: false };
const dwight = DEMO.people.find((p) => p.id === 'dwight')!;
const deployBot: Person = { ...dwight, name: 'Deploy Bot', bot: { profile: 'deploy-bot', role: 'Ships', adapter: 'webhook', capabilities: WEBHOOK } };
const noop = () => {};
const fakeControls = (flow: ControlFlow): Controls => ({ flow, ask: noop, cancel: noop, choose: noop, confirm: async () => {} });
const panel = (person: Person, flow: ControlFlow) =>
  renderToStaticMarkup(<ControlsPanel person={person} snapshot={DEMO} offered={offeredControls(person, true)} controls={fakeControls(flow)} />);

describe('ControlsPanel: the in-page confirmation step', () => {
  it('idle: only the verbs the adapter declares, no confirmation and nothing sent', () => {
    const html = panel(deployBot, { phase: 'idle' });
    expect(html).toContain('>Pause</button>');
    expect(html).toContain('>Resume</button>');
    expect(html).toContain('>Stop current run</button>');
    expect(html).not.toContain('data-testid="control-confirm"');
    const hermes = panel(dwight, { phase: 'idle' });
    expect(hermes).not.toContain('>Pause</button>');
    expect(hermes).toContain('Hermes has no per-bot pause');
  });

  it('confirm: says what will happen, with Confirm and Cancel', () => {
    const html = panel(deployBot, { phase: 'confirm', request: { action: 'pause' } });
    expect(html).toContain('data-testid="control-confirm"');
    expect(html).toContain('Pause Deploy?');
    expect(html).toContain('goes home: no new work until you resume them');
    expect(html).toMatch(/<button type="button" class="control-go">Pause<\/button>/);
    expect(html).toContain('>Cancel</button>');
    expect(html).toContain('tone-danger');
  });

  it('a reassign asks who gets the card, and cannot be confirmed until you pick', () => {
    const html = panel(dwight, { phase: 'confirm', request: { action: 'reassign', args: { taskId: 'task-q4-audit', to: '' } } });
    expect(html).toContain('Hand “Audit the Q4 campaign report” to…');
    expect(html).toContain('<option value="" selected="">Pick a bot…</option>');
    expect(html).toContain('(chief)</option>');
    expect(html).toMatch(/<button type="button" class="control-go" disabled="">Reassign<\/button>/);
  });

  it('sending: both buttons off while the server works', () => {
    const html = panel(dwight, { phase: 'sending', request: { action: 'stop', args: { taskId: 'task-q4-audit' } } });
    expect(html).toContain('Working…');
    expect(html).toContain('class="control-cancel" disabled=""');
  });

  it('done: the server\'s sentence, as a status (or an alert when it failed)', () => {
    expect(panel(dwight, { phase: 'idle', result: { ok: true, text: 'Weekly campaign report: running now.' } }))
      .toContain('<p class="control-result is-ok" role="status">Weekly campaign report: running now.</p>');
    expect(panel(dwight, { phase: 'idle', result: { ok: false, text: 'That card is not running' } })).toContain('role="alert">That card is not running');
  });
});

describe('PersonWindow with controls and a budget', () => {
  const render = (writable: boolean, budget?: BudgetStatus) => renderToStaticMarkup(
    <PersonWindow person={dwight} snapshot={DEMO} demo writable={writable} now={Date.parse(DEMO_NOW)} onOpenArea={() => {}} budget={budget} />,
  );

  it('puts Stop / Reassign on cards and Run now on jobs, only with writes on', () => {
    const html = render(true);
    expect(html).toContain('aria-label="Stop “Audit the Q4 campaign report”"');
    expect(html).toContain('aria-label="Reassign “Audit the Q4 campaign report”"');
    expect(html).toContain('aria-label="Run “Weekly campaign report” now"');
    const readOnly = render(false);
    expect(readOnly).not.toContain('Run now');
    expect(readOnly).not.toContain('Controls for Dwight');
  });

  it('shows the budget gauge, with what Corporate said', () => {
    const budget: BudgetStatus = {
      personId: 'dwight', name: 'Dwight Schrute', level: 'over', action: 'alert', note: "Hermes agents can't be paused; Corporate can only call you",
      lines: [{ period: 'monthly', limit: 20, spent: 21, ratio: 1.05, level: 'over', from: DEMO_NOW, to: DEMO_NOW, unpricedModels: ['house-model'] }],
    };
    const html = render(true, budget);
    expect(html).toContain('data-testid="budget-gauge"');
    expect(html).toContain('Over budget: Corporate wants to talk to you');
    expect(html).toContain('$21.00 of $20.00 · 105%');
    expect(html).toContain('plus usage it can’t price: house-model');
    expect(html).not.toContain('data-testid="budget-gauge"'.repeat(2));
    expect(render(true)).not.toContain('budget-gauge');
  });
});
