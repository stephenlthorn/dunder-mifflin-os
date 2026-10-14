import type { ChatMessage } from '@shared/contract';

type Named = { id: string; name: string; bot?: { profile: string } };

const byTime = (a: ChatMessage, b: ChatMessage) => (Date.parse(a.at) || 0) - (Date.parse(b.at) || 0);

/** Server history plus local messages not yet reflected by the server (matched on author + text). */
export function mergeMessages(server: readonly ChatMessage[], local: readonly ChatMessage[]): ChatMessage[] {
  const seen = new Set(server.map((s) => `${s.authorId}|${s.text}`));
  return [...server, ...local.filter((l) => !seen.has(`${l.authorId}|${l.text}`))].sort(byTime);
}

export function authorName(authorId: string, people: readonly Named[]): string {
  if (authorId === 'you') return 'You';
  return people.find((p) => p.id === authorId)?.name ?? people.find((p) => p.bot?.profile === authorId)?.name ?? authorId;
}
