// Short, scrubbed summaries for the activity timeline: whitespace collapsed, secrets masked (scrub.ts) BEFORE
// shortening, so a cut can never leave half a token unmasked.
import { scrubText } from './scrub.ts';

export const SUMMARY_MAX = 80;

export function oneLine(text: string, max: number = SUMMARY_MAX): string {
  const line = scrubText(text.replace(/\s+/g, ' ').trim());
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line;
}

/** The first non-empty line only (error messages: never the traceback under them). */
export function firstLine(text: string, max: number = SUMMARY_MAX): string {
  return oneLine(text.split(/\r?\n/).find((l) => l.trim()) ?? '', max);
}
