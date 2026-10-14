// What each webhook agent lets the office do to it: the verbs and the callback URL from its latest `controls` event,
// kept in memory (immutable map), server-side only. An agent that never offered a verb has it turned off on its desk.
import type { AgentCapabilities } from '../../../../shared/contract.ts';
import type { ControlVerb, IngestEvent } from './schema.ts';

type ControlsEvent = Extract<IngestEvent, { type: 'controls' }>;
export type ControlOffer = { readonly callback: string; readonly verbs: ReadonlyArray<ControlVerb> };

export function createControlBox() {
  let offers: ReadonlyMap<string, ControlOffer> = new Map();

  function put(agentId: string, e: ControlsEvent): void {
    const rest = [...offers].filter(([id]) => id !== agentId);
    offers = new Map(e.verbs.length && e.callback ? [...rest, [agentId, { callback: e.callback, verbs: e.verbs }]] : rest);
  }

  /** The callback for this verb, or undefined when the agent did not offer it. */
  function callbackFor(agentId: string, verb: ControlVerb): string | undefined {
    const offer = offers.get(agentId);
    return offer && offer.verbs.includes(verb) ? offer.callback : undefined;
  }

  /** The flags this agent turns off (pause/stop it did not offer). */
  function offFor(agentId: string): Partial<AgentCapabilities> {
    const verbs = offers.get(agentId)?.verbs ?? [];
    return { ...(verbs.includes('pause') ? {} : { pause: false }), ...(verbs.includes('stop') ? {} : { stop: false }) };
  }

  /** Forget agents that left the map. */
  function prune(alive: (agentId: string) => boolean): void {
    if ([...offers.keys()].some((id) => !alive(id))) offers = new Map([...offers].filter(([id]) => alive(id)));
  }

  return { put, callbackFor, offFor, prune };
}
