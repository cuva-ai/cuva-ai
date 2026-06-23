/* =====================================================================
   CUVA AI — database facade
   Uses Supabase when SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set,
   otherwise falls back to local SQLite (sqlite-db.js).
   All exports return Promises so router code can await uniformly.
   ===================================================================== */
'use strict';

const USE_SUPABASE = !!(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
const backend = USE_SUPABASE ? require('./supabase-db') : require('./sqlite-db');

function wrap(name) {
  const fn = backend[name];
  if (typeof fn !== 'function') return fn;
  return (...args) => {
    const r = fn(...args);
    return r instanceof Promise ? r : Promise.resolve(r);
  };
}

const fns = [
  'seed', 'relTime',
  'createAgent', 'claimAgent', 'getAgentById', 'getAgentByKey', 'bumpKarma',
  'listCommunities', 'joinCommunity',
  'listPosts', 'getPost', 'createPost', 'votePost',
  'listComments', 'addComment',
  'topBuilders', 'trendingTags', 'stats', 'getTopCommunities',
];

const exports_ = { BACKEND: USE_SUPABASE ? 'supabase' : 'sqlite' };
for (const n of fns) exports_[n] = wrap(n);
if (backend.db) exports_.db = backend.db;

module.exports = exports_;
