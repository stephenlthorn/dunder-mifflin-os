// Serves the built web app (web/dist) for `npm run start`: correct MIME types, SPA fallback to index.html for
// extension-less routes, long caching for hashed /assets/, never a file outside the root and never a dotfile.
import { readFile, stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { BASE_HEADERS, sendError } from './respond.ts';

const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.txt': 'text/plain; charset=utf-8',
};

export function contentTypeFor(file: string): string {
  return MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream';
}

export type StaticSite = {
  /** Handles GET/HEAD for a non-API path. */
  serve(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void>;
};

type Resolved = { kind: 'file'; file: string } | { kind: 'fallback' } | { kind: 'missing' } | { kind: 'bad' };

function decode(pathname: string): string | null {
  try {
    const decoded = decodeURIComponent(pathname);
    return decoded.includes('\0') ? null : decoded;
  } catch {
    return null;
  }
}

async function isFile(file: string): Promise<boolean> {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

async function resolve(root: string, pathname: string): Promise<Resolved> {
  const decoded = decode(pathname);
  if (decoded === null) return { kind: 'bad' };
  const segments = decoded.split(/[\\/]+/).filter(Boolean);
  if (segments.some((s) => s.startsWith('.'))) return { kind: 'missing' }; // "..", dotfiles, .git, .env
  if (segments.length === 0) return { kind: 'fallback' };
  const file = path.join(root, ...segments);
  if (!file.startsWith(root + path.sep)) return { kind: 'missing' };
  if (await isFile(file)) return { kind: 'file', file };
  const last = segments[segments.length - 1] ?? '';
  return last.includes('.') ? { kind: 'missing' } : { kind: 'fallback' };
}

export function createStaticSite(webRoot: string): StaticSite {
  const root = path.resolve(webRoot);
  const index = path.join(root, 'index.html');

  async function send(req: IncomingMessage, res: ServerResponse, file: string, cache: string): Promise<void> {
    const body = await readFile(file);
    res.writeHead(200, { ...BASE_HEADERS, 'Content-Type': contentTypeFor(file), 'Content-Length': body.length, 'Cache-Control': cache });
    res.end(req.method === 'HEAD' ? undefined : body);
  }

  async function serve(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    const found = await resolve(root, pathname);
    if (found.kind === 'bad') return sendError(res, 400, 'Bad path');
    if (found.kind === 'missing') return sendError(res, 404, 'Not found');
    if (found.kind === 'fallback') {
      if (!(await isFile(index))) return sendError(res, 404, 'Web app not built (run npm run build)');
      return send(req, res, index, 'no-cache');
    }
    const hashed = found.file.startsWith(path.join(root, 'assets') + path.sep);
    return send(req, res, found.file, hashed ? 'public, max-age=31536000, immutable' : 'no-cache');
  }

  return { serve };
}
