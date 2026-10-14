// Serving local image files (portraits, bot headshots). The type comes from the file's bytes, not its name, and only
// JPEG and PNG are served. Nothing here returns or logs a path: failures are logged by error code only.
import { readFile, stat } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import { log } from '../log.ts';
import { BASE_HEADERS } from './respond.ts';

export type ImageType = 'image/jpeg' | 'image/png';
export type Image = { body: Buffer; contentType: ImageType };

const MAX_BYTES = 8 * 1024 * 1024;
const QUIET_CODES = new Set(['ENOENT', 'ENOTDIR']); // "no such file" is the normal case, not worth a log line
const ONE_DAY = 86_400;

export function imageType(body: Buffer): ImageType | null {
  if (body.length >= 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff) return 'image/jpeg';
  if (body.length >= 4 && body[0] === 0x89 && body[1] === 0x50 && body[2] === 0x4e && body[3] === 0x47) return 'image/png';
  return null;
}

/** Reads a JPEG/PNG file of at most 8 MB; null when it's missing, not a regular file, too big, unreadable or not an image. */
export async function readImageFile(file: string, what: string): Promise<Image | null> {
  try {
    const info = await stat(file);
    if (!info.isFile() || info.size > MAX_BYTES) return null;
    const body = await readFile(file);
    const contentType = imageType(body);
    return contentType ? { body, contentType } : null;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? 'unknown';
    if (!QUIET_CODES.has(code)) log('image.unreadable', { what, code });
    return null;
  }
}

export function sendImage(res: ServerResponse, image: Image, headers: Readonly<Record<string, string>> = {}): void {
  res.writeHead(200, {
    ...BASE_HEADERS, ...headers, 'Content-Type': image.contentType, 'Content-Length': image.body.length,
    'Cache-Control': `private, max-age=${ONE_DAY}`,
  });
  res.end(image.body);
}
