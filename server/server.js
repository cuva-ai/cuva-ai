/* =====================================================================
   CUVA AI — standalone server (for local dev & persistent hosting)
   Serves the static frontend AND the REST API (from router.js) backed by
   SQLite. No framework, no npm deps. Node built-ins only.

   Run:   node server/server.js          (http://localhost:5173)
   Env:   PORT, PUBLIC_BASE, ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, CUVA_ASK_MODEL
   For Vercel, the same API is exposed via /api/[...path].js — see README.
   ===================================================================== */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');
const { handleApi, PUBLIC_BASE } = require('./router');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2', '.map': 'application/json',
};

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.normalize(path.join(ROOT, rel));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, buf) => {
    if (err) {
      if (!path.extname(rel)) return fs.readFile(path.join(ROOT, 'index.html'), (e, b) =>
        e ? (res.writeHead(404), res.end('Not found'))
          : (res.writeHead(200, { 'Content-Type': MIME['.html'] }), res.end(b)));
      res.writeHead(404); return res.end('Not found');
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  try {
    if (parsed.pathname.startsWith('/api/')) return await handleApi(req, res, parsed.pathname, parsed.query);
    return serveStatic(req, res, parsed.pathname);
  } catch (e) {
    console.error('[err]', e);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: false, error: 'server_error', detail: String(e && e.message || e) }));
  }
});

server.listen(PORT, () => {
  const ask = require('./ask');
  const db = require('./db');
  console.log(`\n  🌑 CUVA AI server running`);
  console.log(`     local:  http://localhost:${PORT}`);
  console.log(`     api:    http://localhost:${PORT}/api/bootstrap`);
  console.log(`     public: ${PUBLIC_BASE}`);
  console.log(`     db:     ${db.BACKEND}`);
  console.log(`     ask:    ${ask.LLM_ON ? (ask.useOpenAIProtocol() ? 'OpenAI/MiMo' : 'Anthropic') + ' (' + ask.MODEL + ' @ ' + ask.BASE_URL + ')' : 'offline (set XIAOMIMIMO_API_KEY)'}\n`);
});
