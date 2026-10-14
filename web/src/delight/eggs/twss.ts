// "That's what she said": a toast when a line in chat sets it up. Only ever in the browser: nothing is sent to a bot.
// It quotes the real line and who said it, at most once every ten minutes, and never in Toby mode.
import type { ChatMessage } from '@shared/contract';

export const TWSS_GAP_MS = 10 * 60_000;
const SETUPS = [
  /\b(?:that|it|this)(?:'s| is| was| one is)? (?:so |really |way |too |very )*(?:hard|big|long|tight|huge)\b/,
  /\btoo (?:big|long|hard|tight)\b/,
  /\bso (?:hard|big)\b/,
  /\bmake it (?:longer|bigger|harder)\b/,
  /\bgo faster\b/,
  /\bget it in\b/,
  /\bkeep it up\b/,
];

export function twssMatch(text: string): boolean {
  const t = text.toLowerCase().replace(/[’‘]/g, "'");
  return SETUPS.some((re) => re.test(t));
}

export type Toast = { text: string; sub?: string };

const quote = (text: string) => (text.length > 90 ? `${text.slice(0, 89).trimEnd()}…` : text);

/** The toast for a chat line, or null (no set-up, or too soon after the last one). */
export function twssFor(msg: ChatMessage, author: string, lastAt: number | null, now: number): Toast | null {
  if (!twssMatch(msg.text) || (lastAt !== null && now - lastAt < TWSS_GAP_MS)) return null;
  return { text: 'That’s what she said!', sub: `“${quote(msg.text.trim())}” — ${author}` };
}
