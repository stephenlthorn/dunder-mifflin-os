// HR · Approvals at Toby's desk: who, what, why, since and risk for each request, with Approve / Reject and a note;
// the buttons are off (with the reason) on a read-only server, and absent for requests the office only shows.
import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { OfficeSnapshot } from '@shared/contract';
import { DEMO_APPROVALS, DEMO_OFFICE } from '@shared/fixtures/demo-approvals';
import { DEMO_NOW } from '@shared/fixtures/demo-snapshot';
import { ApprovalsWindow } from './ApprovalsWindow';

const render = (snapshot: OfficeSnapshot, writable: boolean) => renderToStaticMarkup(
  <ApprovalsWindow snapshot={snapshot} writable={writable} demo={false} now={Date.parse(DEMO_NOW)} onDecided={() => {}} onOpenPerson={() => {}} />,
);
const itemHtml = (html: string, id: string) => html.split('<li').find((chunk) => chunk.includes(`data-approval="${id}"`)) ?? '';

describe('ApprovalsWindow', () => {
  const html = render(DEMO_OFFICE, true);

  it('lists who asks, what, why, since when and the risk, newest first', () => {
    const andy = itemHtml(html, DEMO_APPROVALS[0]!.id);
    expect(andy).toContain('Andy Bernard');
    expect(andy).toContain('Post the welcome thread to the Skool community?');
    expect(andy).toContain('The draft is ready.');
    expect(andy).toContain('7 min ago');
    expect(andy).toContain('medium risk');
    expect(itemHtml(html, DEMO_APPROVALS[1]!.id)).toContain('high risk');
    expect(itemHtml(html, DEMO_APPROVALS[2]!.id)).toContain('party-planner');
  });

  it('offers Approve and Reject with an optional note, and says what each does', () => {
    const andy = itemHtml(html, DEMO_APPROVALS[0]!.id);
    expect(andy).toMatch(/<textarea[^>]*maxLength="500"/);
    expect(andy).toMatch(/<button[^>]*class="approve"[^>]*>Approve<\/button>/);
    expect(andy).toMatch(/<button[^>]*class="reject"[^>]*>Reject<\/button>/);
    expect(andy).toContain('Unblock it (your note goes on the card)');
    expect(andy).not.toMatch(/<button[^>]*disabled/);
  });

  it('has no buttons for a request the office only shows, and says where to answer it', () => {
    const kelly = itemHtml(html, DEMO_APPROVALS[3]!.id);
    expect(kelly).not.toContain('class="approve"');
    expect(kelly).toContain('Answer this one where Kelly Kapoor runs');
  });

  it('turns the buttons off on a read-only server and says how to turn writes on', () => {
    const andy = itemHtml(render(DEMO_OFFICE, false), DEMO_APPROVALS[0]!.id);
    expect(andy).toMatch(/<button[^>]*class="approve"[^>]*disabled=""/);
    expect(andy).toMatch(/<button[^>]*class="reject"[^>]*disabled=""/);
    expect(andy).toContain('DMOS_ALLOW_WRITES=1');
  });

  it('says so when nothing waits', () => {
    expect(render({ ...DEMO_OFFICE, approvals: [] }, true)).toContain('Nothing to sign');
  });
});
