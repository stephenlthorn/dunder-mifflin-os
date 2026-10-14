// config.yaml -> the telegram ROOM fields only (group_allowed_chats, free_response_chats, channel_prompts).
// Chat ids become opaque keys here; prompts are reduced to the room name they mention.
import type { TelegramRoomConfig } from './types.ts';
import { arr, isRecord } from './guards.ts';
import type { ChatKeyer } from './chatKey.ts';

const ROOM_RE = /\b(HQ|Content|Outreach|Ops|R&D|Skool|Council) room\b/;

/** The room a channel prompt is about, read from its last paragraph (the first one lists every room). */
export function extractRoomHint(prompt: string): string | null {
  const paragraphs = prompt.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const own = paragraphs.at(-1) ?? '';
  return ROOM_RE.exec(own)?.[1] ?? null;
}

export function parseTelegramConfig(profile: string, doc: unknown, keyOf: ChatKeyer): TelegramRoomConfig {
  const platforms = isRecord(doc) ? doc.platforms : undefined;
  const telegram = isRecord(platforms) ? platforms.telegram : undefined;
  if (!isRecord(telegram)) return { profile, enabled: false, groupChats: [], leadChats: [], roomHints: {} };
  const prompts = isRecord(telegram.channel_prompts) ? telegram.channel_prompts : {};
  const roomHints = Object.fromEntries(
    Object.entries(prompts).flatMap(([chatId, prompt]) => {
      const hint = typeof prompt === 'string' ? extractRoomHint(prompt) : null;
      return hint ? [[keyOf(chatId), hint]] : [];
    }),
  );
  return {
    profile,
    enabled: telegram.enabled === true,
    groupChats: arr(telegram.group_allowed_chats).map(keyOf),
    leadChats: arr(telegram.free_response_chats).map(keyOf),
    roomHints,
  };
}
