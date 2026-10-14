import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEMO_NOW, DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { PersonWindow } from './PersonWindow';

const render = (personId: string, patch: Record<string, unknown> = {}) => {
  const person = { ...DEMO_SNAPSHOT.people.find((p) => p.id === personId)!, ...patch };
  return renderToStaticMarkup(
    <PersonWindow person={person} snapshot={DEMO_SNAPSHOT} demo writable now={Date.parse(DEMO_NOW)} onOpenArea={() => {}} />,
  );
};

describe('PersonWindow', () => {
  it('shows the Hermes persona name as a small second line when the map keeps its own name', () => {
    const html = render('ira', { persona: 'Hank' });
    expect(html).toContain("Health &amp; fitness · Dwight&#x27;s sensei");
    expect(html).toContain('Hermes persona: Hank');
  });

  it('has no persona line otherwise', () => {
    expect(render('ira')).not.toContain('Hermes persona');
    expect(render('dwight')).not.toContain('Hermes persona');
  });
});

describe('PersonWindow chat composer', () => {
  const NONE = { chat: false, createTask: false, approvals: false, pause: false, stop: false };

  it('offers a composer for a bot whose adapter can chat', () => {
    expect(render('dwight')).toContain('<form class="chat-form"');
  });

  it('hides the composer when the direct line\'s adapter is read-only', () => {
    const snapshot = { ...DEMO_SNAPSHOT, rooms: DEMO_SNAPSHOT.rooms.map((r) => (r.id === 'dm-campaigns' ? { ...r, capabilities: NONE } : r)) };
    const person = DEMO_SNAPSHOT.people.find((p) => p.id === 'dwight')!;
    const html = renderToStaticMarkup(<PersonWindow person={person} snapshot={snapshot} demo writable now={Date.parse(DEMO_NOW)} onOpenArea={() => {}} />);
    expect(html).not.toContain('<form class="chat-form"');
    expect(html).toContain('read-only');
  });
});

describe('PersonWindow agent name line', () => {
  it('calls a non-Hermes agent\'s own name "Agent", not a Hermes persona', () => {
    const caps = { chat: false, createTask: false, approvals: false, pause: false, stop: false };
    const html = render('jim', { persona: 'paper-site', bot: { profile: 'paper-site', role: 'Pair programmer', adapter: 'claude-code', capabilities: caps } });
    expect(html).toContain('Agent: paper-site');
    expect(html).not.toContain('Hermes persona');
    expect(render('ira', { persona: 'Hank', bot: { profile: 'health', role: 'Personal health', adapter: 'hermes' } })).toContain('Hermes persona: Hank');
  });
});
