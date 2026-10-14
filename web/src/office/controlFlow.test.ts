import { describe, expect, it } from 'vitest';
import { IDLE, askFor, cancelFlow, chooseTarget, readyToSend, sendFlow, settleFlow } from './controlFlow';

describe('the in-page confirmation flow', () => {
  it('asks first, then sends, then shows what happened', () => {
    const asked = askFor(IDLE, { action: 'pause' });
    expect(asked).toEqual({ phase: 'confirm', request: { action: 'pause' } });
    const sending = sendFlow(asked);
    expect(sending).toEqual({ phase: 'sending', request: { action: 'pause' } });
    expect(settleFlow(sending, { ok: true, text: 'Paused Dwight Schrute.' })).toEqual({ phase: 'idle', result: { ok: true, text: 'Paused Dwight Schrute.' } });
  });

  it('never sends without a confirmation step', () => {
    expect(sendFlow(IDLE)).toBe(IDLE);
    const done = settleFlow(sendFlow(askFor(IDLE, { action: 'stop' })), { ok: false, text: 'No' });
    expect(sendFlow(done)).toBe(done);
  });

  it('cancel drops the request; a new ask replaces a pending one but not one being sent', () => {
    expect(cancelFlow(askFor(IDLE, { action: 'pause' }))).toEqual(IDLE);
    expect(askFor(askFor(IDLE, { action: 'pause' }), { action: 'resume' })).toEqual({ phase: 'confirm', request: { action: 'resume' } });
    const sending = sendFlow(askFor(IDLE, { action: 'pause' }));
    expect(askFor(sending, { action: 'resume' })).toBe(sending);
    expect(cancelFlow(sending)).toBe(sending);
  });

  it('a reassign is ready only once you picked who gets the card', () => {
    const asked = askFor(IDLE, { action: 'reassign', args: { taskId: 't1', to: '' } });
    expect(readyToSend(asked)).toBe(false);
    expect(sendFlow(asked)).toBe(asked);
    const picked = chooseTarget(asked, 'pam');
    expect(picked).toEqual({ phase: 'confirm', request: { action: 'reassign', args: { taskId: 't1', to: 'pam' } } });
    expect(readyToSend(picked)).toBe(true);
    expect(chooseTarget(askFor(IDLE, { action: 'pause' }), 'pam')).toEqual({ phase: 'confirm', request: { action: 'pause' } });
  });
});
