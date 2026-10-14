import { describe, expect, it } from 'vitest';
import { DEMO_OFFICE } from '@shared/fixtures/demo-approvals';
import { creditsFor } from './credits';

describe('Threat Level Midnight credits', () => {
  it('credit the real cast: every bot as its role, then everyone without a bot, then the numbers', () => {
    const c = creditsFor(DEMO_OFFICE);
    expect(c.title).toBe('Threat Level Midnight');
    expect(c.starring[0]).toEqual({ name: 'Pam Beesly', as: 'Chief of Staff — orchestrator' });
    expect(c.starring).toHaveLength(12);
    expect(c.featuring).toContain('Jim Halpert');
    expect(c.thanks).toEqual(['8 cards on the board', '7 scheduled jobs', '4 requests waiting on you']);
  });
});
