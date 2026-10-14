// Deciding a Hermes approval: re-read the board (never the cache), find the card in the state it was listed in, and run
// the planned `hermes kanban` commands (domain/hermesApprovals.ts) one by one through the runner (execFile, no
// shell). A card that has moved on is refused (409) instead of running a command meant for its old state. Logs the
// card id, the verb and the exit code; never the note or the CLI's output.
import type { ActionResult, ApprovalDecision } from '../adapters/types.ts';
import { decisionCommands, hermesApprovals, parseHermesApprovalId } from '../domain/hermesApprovals.ts';
import type { HermesState } from '../hermes/types.ts';
import { log, redact } from '../log.ts';
import type { Runner } from './runner.ts';

export type ApprovalServiceOptions = {
  readonly runner: Runner;
  readonly hermesBin: string;
  readonly timeoutMs: number;
  readonly readFresh: () => Promise<HermesState>;
};

export function createApprovalService(opts: ApprovalServiceOptions) {
  async function resolve(id: string, decision: ApprovalDecision): Promise<ActionResult<null>> {
    const parsed = parseHermesApprovalId(id);
    if (!parsed) return { ok: false, status: 404, error: 'Unknown approval' };
    const card = (await opts.readFresh()).kanban.waiting?.find((w) => w.id === parsed.taskId && w.status === parsed.status);
    const listed = card ? hermesApprovals([card])[0] : undefined;
    if (!card || !listed) return { ok: false, status: 409, error: 'That card has moved on since it was listed' };
    const steps = decisionCommands(card, decision);
    if (!steps) return { ok: false, status: 409, error: 'Answer this one in Hermes (hermes kanban show)' };
    for (const args of steps) {
      const verb = args[1] ?? 'kanban';
      try {
        const res = await opts.runner(opts.hermesBin, args, { timeoutMs: opts.timeoutMs });
        log('approval.hermes', { card: card.id, verb, code: res.code, timedOut: res.timedOut });
        if (res.timedOut) return { ok: false, status: 504, error: `hermes kanban ${verb} did not answer in time` };
        if (res.code !== 0) return { ok: false, status: 502, error: `hermes kanban ${verb} failed` };
      } catch (error) {
        log('approval.hermes_error', { card: card.id, verb, detail: redact(error instanceof Error ? error.message : String(error)) });
        return { ok: false, status: 502, error: 'Could not start the hermes CLI' };
      }
    }
    return { ok: true, value: null };
  }

  return { resolve };
}
