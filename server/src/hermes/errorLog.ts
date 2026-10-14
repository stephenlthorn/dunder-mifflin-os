// profiles/<p>/logs/errors.log -> ERROR and CRITICAL lines in a window. Only the file's tail is read, and only the
// first line of each record (never tracebacks). Hermes stamps lines in the machine's local time without a zone.
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import type { EpochSeconds } from './types.ts';
import { ACTIVITY_TEXT_MAX, type LogErrorRecord } from './activityTypes.ts';

export const LOG_TAIL_BYTES = 256 * 1024;
const LINE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2}),(\d{3}) (?:ERROR|CRITICAL) (?:\[[^\]]{0,120}\] )?([\w.-]{1,80}): (.*)$/;

/** The last `bytes` of a file as text (the first, probably partial, line dropped); null when there is no file. */
export function readTail(file: string, bytes: number = LOG_TAIL_BYTES): string | null {
  let fd: number;
  try {
    fd = openSync(file, 'r');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  try {
    const size = fstatSync(fd).size;
    const length = Math.min(size, bytes);
    const buf = Buffer.alloc(length);
    readSync(fd, buf, 0, length, size - length);
    const text = buf.toString('utf8');
    return size > length ? text.slice(text.indexOf('\n') + 1) : text;
  } finally {
    closeSync(fd);
  }
}

export function parseErrorLines(text: string, since: EpochSeconds, limit: number): LogErrorRecord[] {
  return text.split('\n').flatMap((line): LogErrorRecord[] => {
    const m = LINE.exec(line);
    if (!m) return [];
    const [, y, mo, d, h, mi, s, ms, logger, message] = m;
    const at = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), Number(ms)).getTime() / 1000;
    return at >= since ? [{ at, logger: logger ?? 'log', message: (message ?? '').slice(0, ACTIVITY_TEXT_MAX) }] : [];
  }).sort((a, b) => b.at - a.at).slice(0, limit);
}
