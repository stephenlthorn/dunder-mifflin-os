// The body of POST /api/people/:id/actions is validated at the boundary: known verbs only, exact argument shapes,
// no unknown fields, ids of a safe shape.
import { describe, expect, it } from 'vitest';
import { parseControlRequest } from '../../src/office/controlRequest.ts';

describe('parseControlRequest', () => {
  it('accepts the bare verbs', () => {
    expect(parseControlRequest({ action: 'pause' })).toEqual({ ok: true, value: { action: 'pause' } });
    expect(parseControlRequest({ action: 'resume', args: {} })).toEqual({ ok: true, value: { action: 'resume' } });
    expect(parseControlRequest({ action: 'stop' })).toEqual({ ok: true, value: { action: 'stop' } });
  });

  it('accepts a stop that names its card, a job to run and a card to hand over', () => {
    expect(parseControlRequest({ action: 'stop', args: { taskId: 't_9f2a' } })).toEqual({ ok: true, value: { action: 'stop', args: { taskId: 't_9f2a' } } });
    expect(parseControlRequest({ action: 'run-job', args: { jobId: 'job3fa9c0e1b2d4' } }))
      .toEqual({ ok: true, value: { action: 'run-job', args: { jobId: 'job3fa9c0e1b2d4' } } });
    expect(parseControlRequest({ action: 'reassign', args: { taskId: 'webhook:bot:card-1.2', to: 'jim' } }))
      .toEqual({ ok: true, value: { action: 'reassign', args: { taskId: 'webhook:bot:card-1.2', to: 'jim' } } });
  });

  it('refuses unknown verbs and bodies that are not objects', () => {
    for (const body of [null, 'pause', [], { action: 'terminate' }, { action: 'PAUSE' }, {}]) {
      expect(parseControlRequest(body)).toMatchObject({ ok: false, error: expect.stringMatching(/action must be one of pause, resume, stop, run-job, reassign/) });
    }
  });

  it('refuses unknown fields, at the top and in args', () => {
    expect(parseControlRequest({ action: 'pause', force: true })).toEqual({ ok: false, error: 'unknown field "force"' });
    expect(parseControlRequest({ action: 'pause', args: { reason: 'x' } })).toEqual({ ok: false, error: 'pause takes no args' });
    expect(parseControlRequest({ action: 'run-job', args: { jobId: 'a', at: 'now' } })).toEqual({ ok: false, error: 'unknown field "args.at"' });
  });

  it('requires the arguments a verb needs, of a safe shape', () => {
    expect(parseControlRequest({ action: 'run-job' })).toEqual({ ok: false, error: 'run-job needs args.jobId' });
    expect(parseControlRequest({ action: 'run-job', args: { jobId: '../../etc' } })).toMatchObject({ ok: false, error: expect.stringMatching(/^args.jobId/) });
    expect(parseControlRequest({ action: 'run-job', args: { jobId: '--accept-hooks' } })).toMatchObject({ ok: false });
    expect(parseControlRequest({ action: 'reassign', args: { taskId: 't1' } })).toEqual({ ok: false, error: 'reassign needs args.to' });
    expect(parseControlRequest({ action: 'reassign', args: { taskId: 't1', to: 'Jim Halpert' } })).toMatchObject({ ok: false, error: expect.stringMatching(/^args.to/) });
    expect(parseControlRequest({ action: 'stop', args: { taskId: '-rf' } })).toMatchObject({ ok: false, error: expect.stringMatching(/^args.taskId/) });
    expect(parseControlRequest({ action: 'stop', args: { taskId: 'x'.repeat(200) } })).toMatchObject({ ok: false });
    expect(parseControlRequest({ action: 'stop', args: 'all' })).toEqual({ ok: false, error: 'args must be an object' });
  });
});
