import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readMeetingRecords } from '../src/hermes/meetingsReader.ts';
import { createChatKeyer } from '../src/hermes/chatKey.ts';
import { MT0, OPS_CHAT_ID, makeMeetingsDb } from './helpers/fakeMeetingsDb.ts';

const dir = mkdtempSync(path.join(tmpdir(), 'dmos-meetings-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));
const keyOf = createChatKeyer(Buffer.from('test'));
const WEEK = { from: MT0 - 86_400, to: MT0 + 6 * 86_400 };

describe('readMeetingRecords (read-only kanban.db)', () => {
  const file = path.join(dir, 'kanban.db');
  makeMeetingsDb(file);
  const records = readMeetingRecords(file, keyOf, WEEK);

  it('reads the cards that can be meetings (council, room subscription, link, made in the OS) active in the period', () => {
    expect(records?.tasks.map((t) => t.id).sort()).toEqual(['t_c1', 't_c2', 't_la', 't_lb', 't_ops', 't_os']);
  });

  it('reads their runs with summaries, comments, links and room subscriptions (chat ids as keys)', () => {
    expect(records?.runs.map((r) => [r.taskId, r.profile, r.outcome, r.summary])).toEqual([
      ['t_c1', 'cmo', 'completed', 'Raise prices 5%.'],
      ['t_c2', 'cfo', 'completed', 'Margins support 3%.'],
      ['t_ops', 'campaigns', 'crashed', null],
    ]);
    expect(records?.comments).toEqual([{ taskId: 't_ops', author: 'user', body: 'Please hurry.', createdAt: MT0 + 7400 }]);
    expect(records?.links).toEqual([{ parentId: 't_la', childId: 't_lb', parentAssignee: 'social', childAssignee: 'chief' }]);
    expect(records?.subs).toEqual([{ taskId: 't_ops', chatKey: keyOf(OPS_CHAT_ID), chatType: 'group', notifierProfile: 'tech' }]);
  });

  it('keeps status-change events with the run profile and only the block reason from payloads', () => {
    expect(records?.events).toEqual([
      { taskId: 't_c1', kind: 'claimed', createdAt: MT0 + 60, profile: 'cmo', reason: null },
      { taskId: 't_c1', kind: 'completed', createdAt: MT0 + 600, profile: 'cmo', reason: null },
      { taskId: 't_ops', kind: 'blocked', createdAt: MT0 + 7350, profile: null, reason: 'Out of paper' },
      { taskId: 't_ops', kind: 'blocked', createdAt: MT0 + 7360, profile: null, reason: null },
    ]);
  });

  it('never carries bodies, results, payloads, errors, metadata or chat ids', () => {
    const json = JSON.stringify(records);
    for (const leak of ['PRIVATE', 'Traceback', OPS_CHAT_ID.slice(1)]) expect(json).not.toContain(leak);
  });

  it('works on an older kanban.db without comments or events', () => {
    const old = path.join(dir, 'old.db');
    makeMeetingsDb(old, { withHistory: false });
    const r = readMeetingRecords(old, keyOf, WEEK);
    expect(r?.tasks.length).toBe(6);
    expect(r?.comments).toEqual([]);
    expect(r?.events).toEqual([]);
  });

  it('is null when there is no kanban.db', () => {
    expect(readMeetingRecords(path.join(dir, 'missing.db'), keyOf, WEEK)).toBeNull();
  });
});
