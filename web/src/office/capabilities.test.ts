import { describe, expect, it } from 'vitest';
import type { AgentCapabilities, Person, Room } from '@shared/contract';
import { canChat, canCreateTask, taskAssignees } from './capabilities';

const NONE: AgentCapabilities = { chat: false, createTask: false, approvals: false, pause: false, stop: false };
const HERMES: AgentCapabilities = { ...NONE, chat: true, createTask: true };
const room = (over: Partial<Room> = {}): Room => ({ id: 'ops', name: 'Ops', areaId: 'conference', kind: 'ops', memberIds: [], ...over });
const look = { skin: '#fff', hair: '#000', hairStyle: 'short', shirt: '#00f' } as const;
const person = (id: string, bot?: Person['bot']): Person => ({ id, name: id, title: '', seatId: `seat.${id}`, look, ...(bot ? { bot } : {}) });

describe('room capabilities', () => {
  it('assumes Hermes (chat + tasks) when the server sends no flags', () => {
    expect(canChat(room())).toBe(true);
    expect(canCreateTask(room())).toBe(true);
  });

  it('follows the flags the adapter declared', () => {
    expect(canChat(room({ capabilities: NONE }))).toBe(false);
    expect(canCreateTask(room({ capabilities: { ...NONE, chat: true } }))).toBe(false);
    expect(canChat(room({ capabilities: HERMES }))).toBe(true);
  });
});

describe('taskAssignees', () => {
  it('offers only bots of the room\'s adapter that can take tasks', () => {
    const people = [
      person('dwight', { profile: 'campaigns', role: '', adapter: 'hermes', capabilities: HERMES }),
      person('jim', { profile: 'deploy-bot', role: '', adapter: 'webhook', capabilities: NONE }),
      person('pam', { profile: 'chief', role: '' }), // older server: no adapter = Hermes
      person('kevin'),
    ];
    expect(taskAssignees(room({ adapter: 'hermes', capabilities: HERMES }), people).map((p) => p.id)).toEqual(['dwight', 'pam']);
    expect(taskAssignees(room(), people).map((p) => p.id)).toEqual(['dwight', 'pam']);
  });
});
