import { describe, expect, it } from 'vitest';
import type { Presence } from '@shared/contract';
import { DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { addUnseen, attentionEvents, attentionOf, notificationText, pruneUnseen } from './attention';

const people = DEMO_SNAPSHOT.people;
const base = DEMO_SNAPSHOT.presence;
const with_ = (patch: Record<string, Presence>) => ({ ...base, ...patch });

describe('attentionOf', () => {
  it('needs-input means needs-you, error means error; anything else needs no attention', () => {
    expect(attentionOf({ status: 'needs-input' })).toBe('needs-you');
    expect(attentionOf({ status: 'error' })).toBe('error');
    expect(attentionOf({ status: 'working' })).toBeNull();
    expect(attentionOf(undefined)).toBeNull();
  });
});

describe('attentionEvents', () => {
  it('fires when a bot changes to error or starts needing you', () => {
    const next = with_({ dwight: { status: 'error', activity: 'Ad account locked' }, kelly: { status: 'needs-input', activity: 'Approve Thursday posts?' } });
    const events = attentionEvents(people, base, next);
    expect(events).toEqual([
      { personId: 'dwight', kind: 'error', name: 'Dwight Schrute', text: 'Ad account locked' },
      { personId: 'kelly', kind: 'needs-you', name: 'Kelly Kapoor', text: 'Approve Thursday posts?' },
    ]);
  });

  it('stays quiet for a bot already in that state, for recoveries and for people without bots', () => {
    expect(attentionEvents(people, base, with_({ sadiq: { status: 'error', activity: 'Still broken' } }))).toEqual([]);
    expect(attentionEvents(people, base, with_({ sadiq: { status: 'idle' } }))).toEqual([]);
    expect(attentionEvents(people, base, with_({ jim: { status: 'error' } }))).toEqual([]);
  });
});

describe('unseen attention', () => {
  it('adds events and forgets bots that recovered before you looked', () => {
    const events = attentionEvents(people, base, with_({ dwight: { status: 'error' }, kelly: { status: 'needs-input' } }));
    const unseen = addUnseen(new Map(), events);
    expect([...unseen.keys()]).toEqual(['dwight', 'kelly']);
    const pruned = pruneUnseen(unseen, with_({ dwight: { status: 'working' }, kelly: { status: 'needs-input' } }));
    expect([...pruned.keys()]).toEqual(['kelly']);
    expect([...unseen.keys()]).toEqual(['dwight', 'kelly']); // not mutated
  });
});

describe('notificationText', () => {
  it('reads like a message from the office', () => {
    expect(notificationText({ personId: 'sadiq', kind: 'error', name: 'Sadiq', text: 'Gateway timeout' }))
      .toEqual({ title: 'Sadiq hit an error', body: 'Gateway timeout' });
    expect(notificationText({ personId: 'pam', kind: 'needs-you', name: 'Pam Beesly', text: '' }))
      .toEqual({ title: 'Pam needs you', body: 'Open Dunder Mifflin OS to answer.' });
  });
});
