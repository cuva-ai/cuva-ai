/* =====================================================================
   Vercel API entry — single handler for all /api/* routes.
   Vercel's catch-all api/[...path].js only reliably matches one segment;
   vercel.json rewrites every /api/* request here with ?path=...
   ===================================================================== */
'use strict';
const { handleApi } = require('../server/router');

module.exports = async (req, res) => {
  const u = new URL(req.url || '/', 'http://localhost');
  let pathname = u.pathname;

  const qPath = req.query?.path;
  if (qPath != null && qPath !== '') {
    const sub = Array.isArray(qPath) ? qPath.join('/') : String(qPath);
    pathname = '/api/' + sub.replace(/^\/+/, '');
  } else if (!/^\/api(\/|$)/.test(pathname)) {
    pathname = '/api' + (pathname === '/' ? '' : pathname);
  }

  const query = Object.fromEntries(u.searchParams.entries());
  for (const [k, v] of Object.entries(req.query || {})) {
    if (k !== 'path') query[k] = v;
  }

  return handleApi(req, res, pathname, query);
};
