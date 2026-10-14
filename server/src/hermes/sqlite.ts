// Read-only SQLite access (node:sqlite). Every open is readOnly + query_only and closed right after use,
// so the server never holds a Hermes database open between polls.
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export type Row = Readonly<Record<string, unknown>>;
export type ReadDb = { all(sql: string, ...params: Array<string | number | null>): Row[] };

const BUSY_TIMEOUT_MS = 2000;

export function withReadOnlyDb<T>(file: string, fn: (db: ReadDb) => T): T | null {
  if (!existsSync(file)) return null;
  const db = new DatabaseSync(file, { readOnly: true, timeout: BUSY_TIMEOUT_MS });
  try {
    db.exec('PRAGMA query_only = 1');
    return fn({ all: (sql, ...params) => db.prepare(sql).all(...params) as Row[] });
  } finally {
    db.close();
  }
}
