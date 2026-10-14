// A plain static file server for the static-demo e2e: serves web/dist-demo under /dunder-mifflin-os/, the way GitHub
// Pages serves a project site, and 404s everything else (there is no /api here). Test infrastructure only.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../dist-demo/', import.meta.url));
const PREFIX = '/dunder-mifflin-os/';
const PORT = Number(process.env.PORT) || 4351;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.ico': 'image/x-icon',
};

function notFound(res) {
  res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not found');
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1');
  if (url.pathname === PREFIX.slice(0, -1)) return void res.writeHead(301, { location: PREFIX }).end();
  if (req.method !== 'GET' || !url.pathname.startsWith(PREFIX)) return notFound(res);
  let rel;
  try {
    rel = decodeURIComponent(url.pathname.slice(PREFIX.length));
  } catch {
    return notFound(res);
  }
  const file = path.resolve(ROOT, rel === '' || rel.endsWith('/') ? `${rel}index.html` : rel);
  if (!file.startsWith(ROOT)) return notFound(res);
  try {
    const body = await readFile(file);
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch {
    notFound(res);
  }
}).listen(PORT, '127.0.0.1', () => process.stdout.write(`static demo on http://127.0.0.1:${PORT}${PREFIX}\n`));
