import { describe, expect, it } from 'vitest';
import { DEMO_OFFICE } from '@shared/fixtures/demo-approvals';
import { DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { bossMugLine } from './bossMug';

describe('the World’s Best Boss mug', () => {
  it('tells the boss (you) who is waiting on you, and for how long', () => {
    expect(bossMugLine(DEMO_OFFICE, Date.parse(DEMO_OFFICE.generatedAt))).toEqual({
      text: 'World’s Best Boss', sub: '4 requests wait for you at Toby’s desk; the oldest for 1 h 35 min.',
    });
  });

  it('or that nobody is, and how the fleet is doing', () => {
    expect(bossMugLine({ ...DEMO_SNAPSHOT, approvals: [] }, Date.parse(DEMO_SNAPSHOT.generatedAt))).toEqual({
      text: 'World’s Best Boss', sub: 'Nobody is waiting on you. 5 bots working, 2 in a meeting, 1 with an error.',
    });
  });
});
