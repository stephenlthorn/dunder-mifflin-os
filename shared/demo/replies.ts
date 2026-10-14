// A demo bot's answer to a message: one of its canned lines, chosen by the seed and how many messages it has had
// today, so replies vary but a given demo always answers the same way. Never echoes what you wrote.
import { FALLBACK_REPLY, REPLIES } from './lines';
import { pick, rng } from './random';

export function cannedReply(agent: string, messageNumber: number, seed: number): string {
  return pick(REPLIES[agent] ?? [], rng(seed, agent, messageNumber, 'reply')) ?? FALLBACK_REPLY;
}
