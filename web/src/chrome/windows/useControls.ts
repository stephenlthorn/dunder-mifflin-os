// A person window's control verbs: the confirmation flow (office/controlFlow.ts) plus sending. Live, the request is
// POSTed and the server's sentence shown; in demo mode nothing is sent. Ask Pam opens a confirmation through `pending`.
import { useCallback, useEffect, useState } from 'react';
import type { OfficeSnapshot, Person } from '@shared/contract';
import type { ControlRequest } from '@shared/controls';
import { postControl } from '../../data/controlsApi';
import { demoControlReply } from '../../budgets/demoCorporate';
import { type ControlFlow, IDLE, askFor, cancelFlow, chooseTarget, readyToSend, sendFlow, settleFlow } from '../../office/controlFlow';
import { confirmCopy } from '../../office/controls';

/** A request from outside the window (Ask Pam); `seq` makes asking twice for the same thing open it again. The window
 *  calls `taken` once it opened the confirmation, so reopening the window later doesn't ask again. */
export type PendingControl = { personId: string; request: ControlRequest; seq: number; taken?: () => void };

export function useControls(person: Person, snapshot: OfficeSnapshot, demo: boolean, pending?: PendingControl) {
  const [flow, setFlow] = useState<ControlFlow>(IDLE);
  const pendingSeq = pending?.personId === person.id ? pending.seq : undefined;

  useEffect(() => {
    if (!pending || pendingSeq === undefined) return;
    setFlow((f) => askFor(f, pending.request));
    pending.taken?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingSeq]);

  const ask = useCallback((request: ControlRequest) => setFlow((f) => askFor(f, request)), []);
  const cancel = useCallback(() => setFlow((f) => cancelFlow(f)), []);
  const choose = useCallback((to: string) => setFlow((f) => chooseTarget(f, to)), []);

  async function confirm(): Promise<void> {
    if (flow.phase !== 'confirm' || !readyToSend(flow)) return;
    const request = flow.request;
    setFlow(sendFlow(flow));
    const out = demo ? { ok: true as const, message: demoControlReply(confirmCopy(request, { person, snapshot }).title) } : await postControl(person.id, request);
    setFlow((f) => settleFlow(f, out.ok ? { ok: true, text: out.message } : { ok: false, text: out.error }));
  }

  return { flow, ask, cancel, choose, confirm };
}

export type Controls = ReturnType<typeof useControls>;
