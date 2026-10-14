// The shared bearer token for inbound agent endpoints (DMOS_INGEST_TOKEN). Compared in constant time: both sides
// are hashed first, so neither the content nor the length of the token leaks through timing.
import { createHash, timingSafeEqual } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';

export const MIN_TOKEN_LENGTH = 24;

/** The token from the environment, or a startup error that says how to make one (never echoing the value). */
export function readIngestToken(raw: string | undefined): string {
  const token = raw?.trim() ?? '';
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new Error(`DMOS_INGEST_TOKEN must be set to a random string of at least ${MIN_TOKEN_LENGTH} characters `
      + 'for the webhook and claude-code adapters (for example: openssl rand -hex 32)');
  }
  return token;
}

const digest = (text: string): Buffer => createHash('sha256').update(text, 'utf8').digest();

export function bearerAuthorizer(token: string): (headers: IncomingHttpHeaders) => boolean {
  const expected = digest(token);
  return (headers) => {
    const header = headers.authorization;
    const match = typeof header === 'string' ? /^Bearer ([^\s]+)$/i.exec(header) : null;
    const given = digest(match?.[1] ?? '');
    return timingSafeEqual(given, expected) && match !== null;
  };
}
