// The in-page confirmation step for control verbs (no browser confirm()): idle -> confirm (what will happen, Confirm /
// Cancel) -> sending -> idle with the server's answer. Nothing is sent without passing through `confirm`. Pure.
import type { ControlRequest } from '@shared/controls';

export type ControlResultLine = { ok: boolean; text: string };
export type ControlFlow =
  | { phase: 'idle'; result?: ControlResultLine }
  | { phase: 'confirm'; request: ControlRequest }
  | { phase: 'sending'; request: ControlRequest };

export const IDLE: ControlFlow = Object.freeze({ phase: 'idle' });

/** Open the confirmation for a request (replacing one waiting to be confirmed, never one being sent). */
export const askFor = (flow: ControlFlow, request: ControlRequest): ControlFlow => (flow.phase === 'sending' ? flow : { phase: 'confirm', request });

export const cancelFlow = (flow: ControlFlow): ControlFlow => (flow.phase === 'confirm' ? IDLE : flow);

/** A reassign needs its new owner picked in the confirmation step. */
export function chooseTarget(flow: ControlFlow, to: string): ControlFlow {
  if (flow.phase !== 'confirm' || flow.request.action !== 'reassign') return flow;
  return { phase: 'confirm', request: { action: 'reassign', args: { ...flow.request.args, to } } };
}

export const readyToSend = (flow: ControlFlow): boolean =>
  flow.phase === 'confirm' && (flow.request.action !== 'reassign' || flow.request.args.to !== '');

export const sendFlow = (flow: ControlFlow): ControlFlow => (readyToSend(flow) && flow.phase === 'confirm' ? { phase: 'sending', request: flow.request } : flow);

export const settleFlow = (flow: ControlFlow, result: ControlResultLine): ControlFlow => (flow.phase === 'sending' ? { phase: 'idle', result } : flow);
