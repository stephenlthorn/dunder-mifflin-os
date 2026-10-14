import { describe, expect, it } from 'vitest';
import { DEMO_SNAPSHOT } from '@shared/fixtures/demo-snapshot';
import { writesAllowed } from './capabilities';

describe('writesAllowed', () => {
  it('allows local echoes in demo mode, where nothing reaches a server', () => {
    expect(writesAllowed({ phase: 'demo', snapshot: DEMO_SNAPSHOT, reason: 'Demo mode' })).toBe(true);
  });

  it('follows the server in live mode and is read-only when it says nothing', () => {
    const live = (capabilities?: { writes: boolean }) =>
      ({ phase: 'live' as const, connected: true, snapshot: capabilities ? { ...DEMO_SNAPSHOT, capabilities } : DEMO_SNAPSHOT });
    expect(writesAllowed(live({ writes: true }))).toBe(true);
    expect(writesAllowed(live({ writes: false }))).toBe(false);
    expect(writesAllowed(live())).toBe(false);
  });

  it('is off while loading', () => {
    expect(writesAllowed({ phase: 'loading', snapshot: null })).toBe(false);
  });
});
