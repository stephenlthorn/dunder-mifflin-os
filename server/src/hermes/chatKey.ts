// Opaque chat keys: Telegram chat ids never leave the adapters. A per-process secret makes keys
// unguessable and unlinkable to the real id (and they change on every restart, so nothing may persist them).
import { createHmac, randomBytes } from 'node:crypto';
import { chatIdText } from './guards.ts';

export type ChatKeyer = (rawChatId: unknown) => string;

export function createChatKeyer(secret: Buffer = randomBytes(32)): ChatKeyer {
  return (rawChatId: unknown): string => {
    const text = chatIdText(rawChatId) ?? `invalid:${String(rawChatId)}`;
    return `c_${createHmac('sha256', secret).update(text).digest('hex').slice(0, 16)}`;
  };
}
