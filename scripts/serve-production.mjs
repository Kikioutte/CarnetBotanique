#!/usr/bin/env node
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.argv[2] || 8892);
const cache = new Map();
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.avif': 'image/avif', '.woff2': 'font/woff2',
};
const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.webmanifest', '.svg']);

function responseFor(file, encoding) {
  const key = `${file}:${encoding || 'identity'}`;
  if (cache.has(key)) return cache.get(key);
  const raw = fs.readFileSync(file);
  let body = raw;
  if (encoding === 'br') body = zlib.brotliCompressSync(raw);
  else if (encoding === 'gzip') body = zlib.gzipSync(raw, { level: 9 });
  const result = { body, rawBytes: raw.length };
  cache.set(key, result);
  return result;
}

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, `http://${req.headers.host || 'localhost'}`).pathname);
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  const file = path.resolve(ROOT, relative);
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('Not found'); return;
  }
  const ext = path.extname(file).toLowerCase();
  const accepted = req.headers['accept-encoding'] || '';
  const encoding = COMPRESSIBLE.has(ext)
    ? (accepted.includes('br') ? 'br' : accepted.includes('gzip') ? 'gzip' : null)
    : null;
  const { body, rawBytes } = responseFor(file, encoding);
  const headers = {
    'Content-Type': MIME[ext] || 'application/octet-stream',
    'Content-Length': body.length,
    'Cache-Control': 'public, max-age=0, must-revalidate',
    'Vary': 'Accept-Encoding',
    'X-Uncompressed-Size': rawBytes,
  };
  if (encoding) headers['Content-Encoding'] = encoding;
  res.writeHead(200, headers); res.end(body);
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Serveur de production compressé : http://127.0.0.1:${PORT}`);
});
