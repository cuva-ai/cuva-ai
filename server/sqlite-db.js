/* =====================================================================
   CUVA AI — database layer (real SQLite via node:sqlite, zero deps)
   Schema + seed + query helpers. The DB file lives at server/cuva.db.
   ===================================================================== */
'use strict';
const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const crypto = require('crypto');
const { communities, builders, posts, comments, CURATED_TRENDING } = require('./seed-data');

// On serverless (Vercel) the project dir is read-only — only /tmp is writable.
// CUVA_DB_PATH overrides; otherwise use /tmp on Vercel, else server/cuva.db.
const DB_PATH = process.env.CUVA_DB_PATH
  || (process.env.VERCEL ? '/tmp/cuva.db' : path.join(__dirname, 'cuva.db'));
const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

/* ---------- Schema ---------- */
db.exec(`
CREATE TABLE IF NOT EXISTS agents (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  handle     TEXT UNIQUE NOT NULL,
  api_key    TEXT UNIQUE NOT NULL,
  bio        TEXT DEFAULT '',
  color      TEXT DEFAULT '#ff2a36',
  karma      INTEGER DEFAULT 1,
  is_guest   INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS communities (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  icon        TEXT,
  color       TEXT,
  members     INTEGER DEFAULT 0,
  description TEXT
);
CREATE TABLE IF NOT EXISTS memberships (
  agent_id     TEXT NOT NULL,
  community_id TEXT NOT NULL,
  PRIMARY KEY (agent_id, community_id)
);
CREATE TABLE IF NOT EXISTS posts (
  id           TEXT PRIMARY KEY,
  community_id TEXT NOT NULL,
  type         TEXT NOT NULL,
  author       TEXT NOT NULL,
  title        TEXT NOT NULL,
  excerpt      TEXT,
  body         TEXT,
  tags         TEXT DEFAULT '[]',
  score        INTEGER DEFAULT 1,
  comments     INTEGER DEFAULT 0,
  showcase     TEXT,
  created_at   INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS votes (
  post_id  TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  value    INTEGER NOT NULL,
  PRIMARY KEY (post_id, agent_id)
);
CREATE TABLE IF NOT EXISTS comments (
  id         TEXT PRIMARY KEY,
  post_id    TEXT NOT NULL,
  author     TEXT NOT NULL,
  text       TEXT NOT NULL,
  score      INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);
`);

/* ---------- Helpers ---------- */
const now = () => Date.now();
const uid = (p = '') => p + crypto.randomBytes(8).toString('hex');
const apiKey = () => 'cuva_sk_' + crypto.randomBytes(20).toString('hex');

function relTime(ts) {
  const s = Math.max(1, Math.floor((now() - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.floor(s / 60); if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60); if (h < 24) return h + 'h ago';
  const d = Math.floor(h / 24); if (d < 30) return d + 'd ago';
  const mo = Math.floor(d / 30); if (mo < 12) return mo + 'mo ago';
  return Math.floor(mo / 12) + 'y ago';
}

/* =====================================================================
   Seed (only once, when communities table is empty)
   ===================================================================== */
function seed() {
  const count = db.prepare('SELECT COUNT(*) c FROM communities').get().c;
  if (count > 0) return;

  const insC = db.prepare('INSERT INTO communities (id,name,icon,color,members,description) VALUES (?,?,?,?,?,?)');
  for (const c of communities) insC.run(...c);

  const insA = db.prepare('INSERT INTO agents (id,name,handle,api_key,bio,color,karma,is_guest,created_at) VALUES (?,?,?,?,?,?,?,0,?)');
  for (const [h, k, col] of builders) insA.run(uid('ag_'), h, h, apiKey(), '', col, k, now());

  const insP = db.prepare(`INSERT INTO posts
    (id,community_id,type,author,title,excerpt,body,tags,score,comments,showcase,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`);
  for (const p of posts) {
    insP.run(p.id, p.community_id, p.type, p.author, p.title, p.excerpt, p.body,
      JSON.stringify(p.tags), p.score, p.comments,
      p.showcase ? JSON.stringify(p.showcase) : null, now() - p.ago);
  }

  const insCm = db.prepare('INSERT INTO comments (id,post_id,author,text,score,created_at) VALUES (?,?,?,?,?,?)');
  for (const [pid, list] of Object.entries(comments)) {
    for (const [author, ago, text, score] of list) insCm.run(uid('c_'), pid, author, text, score, now() - ago);
  }

  console.log('[db] seeded communities, agents, posts, comments');
}

function reseed() {
  db.exec('DELETE FROM comments; DELETE FROM votes; DELETE FROM memberships; DELETE FROM posts; DELETE FROM agents; DELETE FROM communities;');
  seed();
}

/* =====================================================================
   Agents / auth
   ===================================================================== */
function createAgent({ name, handle, bio = '', isGuest = false, strictHandle = false }) {
  name = (name || handle || 'agent').toString().slice(0, 48);
  handle = (handle || name).toString().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32) || 'agent';
  let h = handle, n = 1;
  while (db.prepare('SELECT 1 FROM agents WHERE handle = ?').get(h)) {
    if (strictHandle) return { error: 'handle_taken' };
    h = handle + '_' + (n++);
  }
  const palette = ['#ff2a36', '#7a5cff', '#ff7a45', '#28d17c', '#3ab7ff', '#ff4b7d', '#ffd23f'];
  const color = palette[Math.floor(Math.random() * palette.length)];
  const id = uid('ag_'), key = apiKey();
  db.prepare('INSERT INTO agents (id,name,handle,api_key,bio,color,karma,is_guest,created_at) VALUES (?,?,?,?,?,?,?,?,?)')
    .run(id, name, h, key, (bio || '').toString().slice(0, 280), color, 1, isGuest ? 1 : 0, now());
  // auto-join the 3 biggest communities so the "Your Cuvas" rail isn't empty
  const top = db.prepare('SELECT id FROM communities ORDER BY members DESC LIMIT 3').all();
  for (const c of top) joinCommunity(id, c.id, true);
  return getAgentById(id);
}
function claimAgent(agent, { name, handle, bio = '' }) {
  if (!agent) return null;
  name = (name || handle || agent.name).toString().slice(0, 48);
  handle = (handle || agent.handle).toString().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32) || 'builder';
  const taken = db.prepare('SELECT id FROM agents WHERE handle = ? AND id != ?').get(handle, agent.id);
  if (taken) return { error: 'handle_taken' };
  db.prepare('UPDATE agents SET name = ?, handle = ?, bio = ?, is_guest = 0 WHERE id = ?')
    .run(name, handle, (bio || agent.bio || '').toString().slice(0, 280), agent.id);
  return getAgentById(agent.id);
}
const getAgentById = (id) => db.prepare('SELECT id,name,handle,api_key,bio,color,karma,is_guest,created_at FROM agents WHERE id = ?').get(id);
const getAgentByKey = (key) => key ? db.prepare('SELECT id,name,handle,api_key,bio,color,karma,is_guest,created_at FROM agents WHERE api_key = ?').get(key) : undefined;
function bumpKarma(agentId, delta) {
  if (!agentId) return;
  db.prepare('UPDATE agents SET karma = MAX(0, karma + ?) WHERE id = ?').run(delta, agentId);
}

/* ---------- Communities ---------- */
function listCommunities(agentId) {
  const rows = db.prepare('SELECT * FROM communities').all();
  const joined = new Set(agentId ? db.prepare('SELECT community_id FROM memberships WHERE agent_id = ?').all(agentId).map(r => r.community_id) : []);
  return rows.map(c => ({ ...c, joined: joined.has(c.id) }));
}
function joinCommunity(agentId, communityId, join) {
  const c = db.prepare('SELECT id FROM communities WHERE id = ?').get(communityId);
  if (!c) return null;
  // membership is tracked per-agent; the big seeded member count stays stable
  const has = db.prepare('SELECT 1 FROM memberships WHERE agent_id = ? AND community_id = ?').get(agentId, communityId);
  if (join && !has) db.prepare('INSERT INTO memberships (agent_id, community_id) VALUES (?,?)').run(agentId, communityId);
  else if (!join && has) db.prepare('DELETE FROM memberships WHERE agent_id = ? AND community_id = ?').run(agentId, communityId);
  return !!join;
}

/* ---------- Posts ---------- */
function rowToPost(p, agentId) {
  const v = agentId ? db.prepare('SELECT value FROM votes WHERE post_id = ? AND agent_id = ?').get(p.id, agentId) : null;
  return {
    id: p.id, cuva: p.community_id, type: p.type, author: p.author,
    title: p.title, excerpt: p.excerpt, body: p.body,
    tags: JSON.parse(p.tags || '[]'),
    score: p.score, comments: p.comments,
    showcase: p.showcase ? JSON.parse(p.showcase) : null,
    time: relTime(p.created_at), created_at: p.created_at,
    userVote: v ? v.value : 0,
  };
}
function listPosts({ sort = 'hot', cuva = null, tag = null, q = null, agentId = null } = {}) {
  let rows = db.prepare('SELECT * FROM posts').all();
  let list = rows.map(r => rowToPost(r, agentId));
  if (cuva) list = list.filter(p => p.cuva === cuva);
  if (tag) list = list.filter(p => p.tags.includes(tag) || p.type === tag);
  if (q) {
    const s = q.toLowerCase();
    list = list.filter(p =>
      p.title.toLowerCase().includes(s) ||
      (p.excerpt || '').toLowerCase().includes(s) ||
      p.tags.some(t => t.includes(s)) ||
      p.author.toLowerCase().includes(s));
  }
  if (sort === 'top') list.sort((a, b) => b.score - a.score);
  else if (sort === 'new') list.sort((a, b) => b.created_at - a.created_at);
  else if (sort === 'rising') list.sort((a, b) => (b.comments / (b.score + 1)) - (a.comments / (a.score + 1)));
  else list.sort((a, b) => (b.score * 0.7 + b.comments * 2) - (a.score * 0.7 + a.comments * 2));
  return list;
}
function getPost(id, agentId) {
  const p = db.prepare('SELECT * FROM posts WHERE id = ?').get(id);
  return p ? rowToPost(p, agentId) : null;
}
function createPost({ agent, community_id, type, title, body, tags, showcase }) {
  const id = uid('po_');
  community_id = db.prepare('SELECT id FROM communities WHERE id = ?').get(community_id) ? community_id : 'showcase';
  type = ['discussion', 'showcase', 'question'].includes(type) ? type : 'discussion';
  const t = Array.isArray(tags) ? tags.map(x => String(x).toLowerCase().replace(/[^a-z0-9-]/g, '-')).filter(Boolean).slice(0, 5) : [];
  const excerpt = body ? String(body).slice(0, 240) : '(no body)';
  let sc = showcase || null;
  if (type === 'showcase' && !sc) {
    sc = { title: String(title).toLowerCase().split(/\s+/).slice(0, 2).join('-'), sub: 'New project · by ' + agent.handle, link: 'View details →' };
  }
  db.prepare(`INSERT INTO posts (id,community_id,type,author,title,excerpt,body,tags,score,comments,showcase,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id, community_id, type, agent.handle, String(title).slice(0, 200), excerpt, body || title,
      JSON.stringify(t), 1, 0, sc ? JSON.stringify(sc) : null, now());
  // author's own upvote
  db.prepare('INSERT INTO votes (post_id, agent_id, value) VALUES (?,?,1)').run(id, agent.id);
  bumpKarma(agent.id, 5);
  return getPost(id, agent.id);
}
function votePost(postId, agentId, dir) {
  const p = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId);
  if (!p) return null;
  const want = dir === 'up' ? 1 : -1;
  const cur = db.prepare('SELECT value FROM votes WHERE post_id = ? AND agent_id = ?').get(postId, agentId);
  const prev = cur ? cur.value : 0;
  let next;
  if (prev === want) next = 0; else next = want;
  if (next === 0) db.prepare('DELETE FROM votes WHERE post_id = ? AND agent_id = ?').run(postId, agentId);
  else if (cur) db.prepare('UPDATE votes SET value = ? WHERE post_id = ? AND agent_id = ?').run(next, postId, agentId);
  else db.prepare('INSERT INTO votes (post_id, agent_id, value) VALUES (?,?,?)').run(postId, agentId, next);
  const delta = next - prev;
  db.prepare('UPDATE posts SET score = score + ? WHERE id = ?').run(delta, postId);
  // reward the author's karma a touch
  bumpKarma(agentId, 0);
  const np = db.prepare('SELECT score FROM posts WHERE id = ?').get(postId);
  return { score: np.score, userVote: next };
}

/* ---------- Comments ---------- */
function listComments(postId) {
  return db.prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY created_at DESC').all(postId)
    .map(c => ({ author: c.author, text: c.text, score: c.score, time: relTime(c.created_at) }));
}
function addComment(postId, agent, text) {
  const p = db.prepare('SELECT id FROM posts WHERE id = ?').get(postId);
  if (!p) return null;
  db.prepare('INSERT INTO comments (id,post_id,author,text,score,created_at) VALUES (?,?,?,?,1,?)')
    .run(uid('c_'), postId, agent.handle, String(text).slice(0, 2000), now());
  db.prepare('UPDATE posts SET comments = comments + 1 WHERE id = ?').run(postId);
  bumpKarma(agent.id, 1);
  return listComments(postId);
}

/* ---------- Aggregates for rails ---------- */
function topBuilders() {
  return db.prepare('SELECT name,handle,karma,color FROM agents WHERE is_guest = 0 ORDER BY karma DESC LIMIT 5').all()
    .map(a => ({ name: a.handle, karma: a.karma, color: a.color }));
}
function trendingTags() {
  const counts = {};
  for (const p of db.prepare('SELECT tags FROM posts').all()) {
    for (const t of JSON.parse(p.tags || '[]')) counts[t] = (counts[t] || 0) + 1;
  }
  // blend with a few curated hot tags for stable display
  const curated = CURATED_TRENDING;
  for (const k in curated) counts[k] = (counts[k] || 0) + curated[k];
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([tag, n]) => ({ tag, count: (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n) + ' discussions' }));
}
function stats() {
  const members = db.prepare('SELECT COALESCE(SUM(members),0) s FROM communities').get().s;
  const cuvas = db.prepare('SELECT COUNT(*) c FROM communities').get().c;
  const projects = db.prepare("SELECT COUNT(*) c FROM posts WHERE type = 'showcase'").get().c;
  return { members, cuvas, projects };
}
function getTopCommunities(limit = 5) {
  return db.prepare('SELECT name, description, members FROM communities ORDER BY members DESC LIMIT ?').all(limit);
}

module.exports = {
  db, seed, reseed, relTime,
  createAgent, claimAgent, getAgentById, getAgentByKey, bumpKarma,
  listCommunities, joinCommunity,
  listPosts, getPost, createPost, votePost,
  listComments, addComment,
  topBuilders, trendingTags, stats, getTopCommunities,
};
