// Finds secrets in API responses without ever printing them: hits are reported as "<where>: <kind>" only.
import { readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withReadOnlyDb } from '../../src/hermes/sqlite.ts';
import { BOT_PROFILES } from '../../src/roster.ts';

export const LEAK_PATTERNS: ReadonlyArray<readonly [string, RegExp]> = [
  ['telegram bot token', /\b\d{8,10}:[A-Za-z0-9_-]{30,}/],
  ['api key', /\b(?:sk-(?:ant-)?[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_\w{20,}|xox[abprs]-[A-Za-z0-9-]{10,}|AIza[\w-]{30,}|AKIA[0-9A-Z]{16})/],
  ['bearer token', /\bBearer\s+[\w.-]{16,}/i],
  ['telegram chat id', /-100\d{7,}/],
  ['long digit run (chat/user id)', /(?<![\dA-Za-z])-?\d{9,}(?![\dA-Za-z])/], // not inside hex message uids
  ['phone number (international)', /\+\d[\d\s().-]{7,}\d/],
  ['phone number (US style)', /(?<!\d)\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}(?!\d)/],
  ['~/.hermes path', /\.hermes\b/i],
  ['home directory path', /\/Users\/|\/home\/\w/],
  ['opaque chat key', /\bc_[0-9a-f]{16}\b/],
];

/** Telegram chat/user ids Hermes knows about (configs, Telegram sessions, kanban subs), as text, both signs. */
export function knownChatIds(hermesHome: string): ReadonlyArray<string> {
  const fromConfigs = BOT_PROFILES.flatMap((p) => {
    try {
      // 9+ digits: Telegram group/user ids (shorter numbers there are token limits, timeouts, ...)
      return readFileSync(path.join(hermesHome, 'profiles', p, 'config.yaml'), 'utf8').match(/-?\d{9,}/g) ?? [];
    } catch {
      return [];
    }
  });
  const column = (file: string, sql: string) =>
    (withReadOnlyDb(file, (db) => db.all(sql)) ?? []).flatMap((r) => Object.values(r).map((v) => String(v ?? '')));
  const fromSessions = BOT_PROFILES.flatMap((p) => column(path.join(hermesHome, 'profiles', p, 'state.db'),
    `SELECT DISTINCT chat_id, user_id FROM sessions WHERE source = 'telegram'`));
  const fromSubs = column(path.join(hermesHome, 'kanban.db'), 'SELECT DISTINCT chat_id, user_id FROM kanban_notify_subs');
  const ids = [...fromConfigs, ...fromSessions, ...fromSubs].filter((v) => /^-?\d{6,}$/.test(v));
  return [...new Set(ids.flatMap((v) => [v, v.replace(/^-/, '')]))];
}

export function scanForLeaks(where: string, text: string, chatIds: ReadonlyArray<string>, hermesHome: string): string[] {
  const kinds = [
    ...LEAK_PATTERNS.filter(([, re]) => re.test(text)).map(([kind]) => kind),
    ...(chatIds.some((id) => new RegExp(`(?<![\\dA-Za-z])${id}(?![\\dA-Za-z])`).test(text)) ? ['a known Telegram chat/user id'] : []),
    ...(text.includes(hermesHome) || text.includes(os.homedir()) ? ['the Hermes home path'] : []),
  ];
  return kinds.map((kind) => `${where}: ${kind}`);
}
