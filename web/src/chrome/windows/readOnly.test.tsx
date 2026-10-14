import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DEMO_NOW, DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { AreaWindow } from './AreaWindow';
import { PersonWindow } from './PersonWindow';

const dwight = DEMO_SNAPSHOT.people.find((p) => p.id === 'dwight')!;
const ops = DEMO_SNAPSHOT.rooms.find((r) => r.id === 'ops')!;
const noop = () => {};

const person = (writable: boolean) => renderToStaticMarkup(
  <PersonWindow person={dwight} snapshot={DEMO_SNAPSHOT} demo={false} writable={writable} now={Date.parse(DEMO_NOW)} onOpenArea={noop} />,
);
const area = (writable: boolean) => renderToStaticMarkup(
  <AreaWindow areaId="conference" room={ops} snapshot={DEMO_SNAPSHOT} demo={false} writable={writable}
    onSelectRoom={noop} onOpenPerson={noop} onTaskCreated={noop} />,
);

describe('read-only windows', () => {
  it('replace the chat composer with a hint that says how to turn writes on', () => {
    const html = person(false);
    expect(html).not.toContain('<form class="chat-form"');
    expect(html).toContain('class="read-only-hint"');
    expect(html).toContain('DMOS_ALLOW_WRITES=1');
  });

  it('replace the new-task form in the Ops room with the same hint', () => {
    const html = area(false);
    expect(html).not.toContain('aria-label="New shared task"');
    expect(html).not.toContain('<form class="chat-form"');
    expect(html).toContain('class="read-only-hint"');
  });

  it('show the composer and the task form when writes are on', () => {
    expect(person(true)).toContain('<form class="chat-form"');
    const html = area(true);
    expect(html).toContain('aria-label="New shared task"');
    expect(html).not.toContain('read-only-hint');
  });
});
