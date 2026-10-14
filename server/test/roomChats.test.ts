import { describe, expect, it } from 'vitest';
import { deriveRoomChats, roomForChat } from '../src/domain/roomChats.ts';
import type { TelegramRoomConfig } from '../src/hermes/types.ts';

const cfg = (profile: string, groupChats: string[], leadChats: string[] = [], roomHints: Record<string, string> = {}): TelegramRoomConfig =>
  ({ profile, enabled: true, groupChats, leadChats, roomHints });

// An example layout with opaque keys.
const LIVE_LIKE: TelegramRoomConfig[] = [
  cfg('tech', ['c_ops', 'c_rnd', 'c_council'], ['c_ops', 'c_rnd'], { c_ops: 'Ops', c_rnd: 'R&D', c_council: 'Council' }),
  cfg('chief', ['c_hq', 'c_council'], ['c_hq', 'c_council'], { c_hq: 'HQ', c_council: 'Council' }),
  cfg('campaigns', ['c_out'], ['c_out'], { c_out: 'Outreach' }),
  cfg('social', ['c_content'], ['c_content'], { c_content: 'Content' }),
  cfg('skool', ['c_skool'], ['c_skool'], { c_skool: 'Skool' }),
  cfg('cmo', ['c_council'], [], { c_council: 'Council' }),
  cfg('cfo', ['c_council'], [], { c_council: 'Council' }),
  cfg('ai-strategist', ['c_council', 'c_rnd'], [], { c_council: 'Council', c_rnd: 'R&D' }),
  cfg('general', []),
];

describe('deriveRoomChats', () => {
  it('maps every group room from channel prompts, with the profiles configured in it', () => {
    const map = Object.fromEntries(deriveRoomChats(LIVE_LIKE, {}).map((rc) => [rc.roomId, rc]));
    expect(Object.keys(map).sort()).toEqual(['content', 'council', 'hq', 'ops', 'outreach', 'rnd', 'skool']);
    expect(map.ops?.chatKey).toBe('c_ops');
    expect(map.rnd).toEqual({ roomId: 'rnd', chatKey: 'c_rnd', profiles: ['tech', 'ai-strategist'] });
    expect(map.council?.profiles).toEqual(['tech', 'chief', 'cmo', 'cfo', 'ai-strategist']);
  });

  it('falls back to the Telegram group title when prompts say nothing', () => {
    const rc = deriveRoomChats([cfg('tech', ['c_a', 'c_b'], ['c_a', 'c_b'])], { c_a: 'Dunder Mifflin Ops', c_b: 'Dunder Mifflin R&D' });
    expect(rc.map((r) => [r.roomId, r.chatKey])).toEqual([['ops', 'c_a'], ['rnd', 'c_b']]);
  });

  it('falls back to elimination: a lead with one lead chat and one unresolved room', () => {
    const rc = deriveRoomChats([cfg('campaigns', ['c_x'], ['c_x'])], {});
    expect(rc).toEqual([{ roomId: 'outreach', chatKey: 'c_x', profiles: ['campaigns'] }]);
  });

  it('does not guess when a lead has two unexplained chats', () => {
    expect(deriveRoomChats([cfg('chief', ['c_1', 'c_2'], ['c_1', 'c_2'])], {})).toEqual([]);
  });

  it('assigns at most one chat per room, preferring the one the lead leads', () => {
    const rc = deriveRoomChats([
      cfg('cmo', ['c_old'], [], { c_old: 'Ops' }),
      cfg('tech', ['c_new'], ['c_new'], { c_new: 'Ops' }),
    ], {});
    expect(rc).toEqual([{ roomId: 'ops', chatKey: 'c_new', profiles: ['tech'] }]);
  });

  it('ignores an internal group that names no room', () => {
    const rc = deriveRoomChats([cfg('tech', ['c_internal'], [], {})], { c_internal: '[INTERNAL] Something' });
    expect(rc).toEqual([]);
  });
});

describe('roomForChat', () => {
  it('finds the room id for a chat key', () => {
    const rc = deriveRoomChats(LIVE_LIKE, {});
    expect(roomForChat(rc, 'c_council')).toBe('council');
    expect(roomForChat(rc, 'c_unknown')).toBeUndefined();
  });
});
