import { describe, expect, it } from 'vitest';
import { collectRoomMessages } from '../src/domain/roomMessages.ts';
import type { HermesSource, MessageQuery, MessagesResult, RawMessage, RoomChat } from '../src/hermes/types.ts';

const T = 1_800_000_000;
const msg = (profile: string, uid: string, role: 'user' | 'assistant', text: string, at: number, pid: string | null = null): RawMessage =>
  ({ uid, profile, role, text, at, origin: 'telegram', platformMessageId: pid });

function fakeSource(byProfile: Record<string, MessagesResult>) {
  const queries: MessageQuery[] = [];
  const source: HermesSource = {
    kind: 'fixture',
    readState: async () => { throw new Error('unused'); },
    readMessages: async (q) => {
      queries.push(q);
      return byProfile[q.profile] ?? { ok: false, reason: 'no-state-db' };
    },
  };
  return { source, queries };
}

const CHATS: RoomChat[] = [{ roomId: 'council', chatKey: 'c_council', profiles: ['chief', 'cmo', 'stamford'] }];

describe('collectRoomMessages', () => {
  it('merges the lead and members of a linked group room (lead also contributes the OS thread)', async () => {
    const { source, queries } = fakeSource({
      chief: { ok: true, messages: [msg('chief', 'a', 'user', 'Thoughts?', T, '1'), msg('chief', 'b', 'assistant', 'Minutes follow.', T + 5)] },
      cmo: { ok: true, messages: [msg('cmo', 'c', 'user', 'Thoughts?', T, '1'), msg('cmo', 'd', 'assistant', 'More billboards.', T + 3)] },
    });
    const res = await collectRoomMessages(source, 'council', CHATS, 50);
    expect(queries.map((q) => [q.profile, q.target.kind, q.osSessionTitle])).toEqual([
      ['chief', 'group', 'dmos-council'], ['cmo', 'group', null],
    ]);
    expect(res).toEqual({
      messages: [
        { id: 'chief-a', roomId: 'council', text: 'Thoughts?', at: new Date(T * 1000).toISOString() },
        { id: 'cmo-d', roomId: 'council', authorAgentId: 'cmo', text: 'More billboards.', at: new Date((T + 3) * 1000).toISOString() },
        { id: 'chief-b', roomId: 'council', authorAgentId: 'chief', text: 'Minutes follow.', at: new Date((T + 5) * 1000).toISOString() },
      ],
    });
  });

  it('reads only the OS thread for a room with no Telegram group, and says why when empty', async () => {
    const { source, queries } = fakeSource({ skool: { ok: true, messages: [] } });
    const res = await collectRoomMessages(source, 'skool', [], 50);
    expect(queries).toEqual([{ profile: 'skool', target: { kind: 'none' }, osSessionTitle: 'dmos-skool', limit: 50 }]);
    expect(res).toEqual({ messages: [], reason: 'room-not-linked-to-a-telegram-group' });
  });

  it('reads the DM for a direct line', async () => {
    const { source, queries } = fakeSource({ tech: { ok: true, messages: [msg('tech', 'x', 'assistant', 'Hi', T)] } });
    const res = await collectRoomMessages(source, 'dm-tech', [], 10);
    expect(queries[0]).toEqual({ profile: 'tech', target: { kind: 'dm' }, osSessionTitle: 'dmos-dm-tech', limit: 10 });
    expect(res.messages).toHaveLength(1);
    expect(res.reason).toBeUndefined();
  });

  it('passes the adapter\'s reason through when nothing could be read', async () => {
    const { source } = fakeSource({});
    expect(await collectRoomMessages(source, 'dm-health', [], 10)).toEqual({ messages: [], reason: 'no-state-db' });
  });

  it('says "empty" when the sources were readable but had no messages', async () => {
    const { source } = fakeSource({ tech: { ok: true, messages: [] } });
    expect(await collectRoomMessages(source, 'dm-tech', [], 10)).toEqual({ messages: [], reason: 'empty' });
  });
});
