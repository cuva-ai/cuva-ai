/* =====================================================================
   CUVA AI — Supabase database layer (PostgREST via fetch, zero npm deps)
   Mirrors the SQLite API in sqlite-db.js for posts, comments, agents, etc.
   Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in your host env to enable.
   ===================================================================== */
'use strict';
const crypto = require('crypto');
const { communities, builders, posts, comments, CURATED_TRENDING } = require('./seed-data');

const SB_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

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

async function sb(path, { method = 'GET', body, prefer, count } = {}) {
  const headers = {
    apikey: SB_KEY,
    Authorization: `Bearer ${SB_KEY}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  if (count) headers.Prefer = (headers.Prefer ? headers.Prefer + ', ' : '') + 'count=exact';

  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body != null ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Supabase ${method} ${path}: ${res.status} ${detail.slice(0, 240)}`);
  }
  if (res.status === 204) return { data: null, count: count ? parseInt(res.headers.get('content-range')?.split('/')[1] || '0', 10) : null };
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('json') ? await res.json() : null;
  const total = count ? parseInt(res.headers.get('content-range')?.split('/')[1] || '0', 10) : null;
  return { data, count: total };
}

async function seed() {
  const { count } = await sb('communities?select=id', { count: true, prefer: 'count=exact' });
  if (count > 0) return;

  await sb('communities', {
    method: 'POST',
    prefer: 'return=minimal',
    body: communities.map(([id, name, icon, color, members, description]) => ({ id, name, icon, color, members, description })),
  });

  const agentRows = builders.map(([h, k, col]) => ({
    id: uid('ag_'), name: h, handle: h, api_key: apiKey(), bio: '', color: col, karma: k, is_guest: false, created_at: now(),
  }));
  await sb('agents', { method: 'POST', prefer: 'return=minimal', body: agentRows });

  await sb('posts', {
    method: 'POST', prefer: 'return=minimal',
    body: posts.map(p => ({
      id: p.id, community_id: p.community_id, type: p.type, author: p.author,
      title: p.title, excerpt: p.excerpt, body: p.body,
      tags: JSON.stringify(p.tags), score: p.score, comments: p.comments,
      showcase: p.showcase ? JSON.stringify(p.showcase) : null,
      created_at: now() - p.ago,
    })),
  });

  const commentRows = [];
  for (const [post_id, list] of Object.entries(comments)) {
    for (const [author, ago, text, score] of list) {
      commentRows.push({ id: uid('c_'), post_id, author, text, score, created_at: now() - ago });
    }
  }
  await sb('comments', { method: 'POST', prefer: 'return=minimal', body: commentRows });

  console.log('[db:supabase] seeded communities, agents, posts, comments');
}

async function reseed() {
  await sb('comments?id=not.is.null', { method: 'DELETE', prefer: 'return=minimal' });
  await sb('votes?post_id=not.is.null', { method: 'DELETE', prefer: 'return=minimal' });
  await sb('memberships?agent_id=not.is.null', { method: 'DELETE', prefer: 'return=minimal' });
  await sb('posts?id=not.is.null', { method: 'DELETE', prefer: 'return=minimal' });
  await sb('agents?id=not.is.null', { method: 'DELETE', prefer: 'return=minimal' });
  await sb('communities?id=not.is.null', { method: 'DELETE', prefer: 'return=minimal' });
  await seed();
}

async function createAgent({ name, handle, bio = '', isGuest = false, strictHandle = false }) {
  name = (name || handle || 'agent').toString().slice(0, 48);
  handle = (handle || name).toString().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32) || 'agent';
  let h = handle, n = 1;
  while (true) {
    const { data } = await sb(`agents?handle=eq.${encodeURIComponent(h)}&select=id&limit=1`);
    if (!data?.length) break;
    if (strictHandle) return { error: 'handle_taken' };
    h = handle + '_' + (n++);
  }
  const palette = ['#ff2a36', '#7a5cff', '#ff7a45', '#28d17c', '#3ab7ff', '#ff4b7d', '#ffd23f'];
  const color = palette[Math.floor(Math.random() * palette.length)];
  const id = uid('ag_'), key = apiKey();
  const row = { id, name, handle: h, api_key: key, bio: (bio || '').toString().slice(0, 280), color, karma: 1, is_guest: !!isGuest, created_at: now() };
  await sb('agents', { method: 'POST', prefer: 'return=representation', body: row });
  const { data: top } = await sb('communities?select=id&order=members.desc&limit=3');
  for (const c of top || []) await joinCommunity(id, c.id, true);
  return getAgentById(id);
}

async function claimAgent(agent, { name, handle, bio = '' }) {
  if (!agent) return null;
  name = (name || handle || agent.name).toString().slice(0, 48);
  handle = (handle || agent.handle).toString().toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 32) || 'builder';
  const { data: taken } = await sb(`agents?handle=eq.${encodeURIComponent(handle)}&id=neq.${encodeURIComponent(agent.id)}&select=id&limit=1`);
  if (taken?.length) return { error: 'handle_taken' };
  await sb(`agents?id=eq.${encodeURIComponent(agent.id)}`, {
    method: 'PATCH', prefer: 'return=minimal',
    body: { name, handle, bio: (bio || agent.bio || '').toString().slice(0, 280), is_guest: false },
  });
  return getAgentById(agent.id);
}

async function getAgentById(id) {
  const { data } = await sb(`agents?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  return data?.[0] || undefined;
}
async function getAgentByKey(key) {
  if (!key) return undefined;
  const { data } = await sb(`agents?api_key=eq.${encodeURIComponent(key)}&select=*&limit=1`);
  return data?.[0] || undefined;
}
async function bumpKarma(agentId, delta) {
  if (!agentId) return;
  const a = await getAgentById(agentId);
  if (!a) return;
  await sb(`agents?id=eq.${encodeURIComponent(agentId)}`, {
    method: 'PATCH', prefer: 'return=minimal',
    body: { karma: Math.max(0, (a.karma || 0) + delta) },
  });
}

async function listCommunities(agentId) {
  const { data: rows } = await sb('communities?select=*&order=members.desc');
  let joined = new Set();
  if (agentId) {
    const { data: m } = await sb(`memberships?agent_id=eq.${encodeURIComponent(agentId)}&select=community_id`);
    joined = new Set((m || []).map(r => r.community_id));
  }
  return (rows || []).map(c => ({ ...c, joined: joined.has(c.id) }));
}

async function joinCommunity(agentId, communityId, join) {
  const { data: c } = await sb(`communities?id=eq.${encodeURIComponent(communityId)}&select=id&limit=1`);
  if (!c?.length) return null;
  const { data: has } = await sb(`memberships?agent_id=eq.${encodeURIComponent(agentId)}&community_id=eq.${encodeURIComponent(communityId)}&select=agent_id&limit=1`);
  if (join && !has?.length) {
    await sb('memberships', { method: 'POST', prefer: 'return=minimal', body: { agent_id: agentId, community_id: communityId } });
  } else if (!join && has?.length) {
    await sb(`memberships?agent_id=eq.${encodeURIComponent(agentId)}&community_id=eq.${encodeURIComponent(communityId)}`, { method: 'DELETE' });
  }
  return !!join;
}

function rowToPost(p, voteVal) {
  return {
    id: p.id, cuva: p.community_id, type: p.type, author: p.author,
    title: p.title, excerpt: p.excerpt, body: p.body,
    tags: JSON.parse(p.tags || '[]'),
    score: p.score, comments: p.comments,
    showcase: p.showcase ? JSON.parse(p.showcase) : null,
    time: relTime(p.created_at), created_at: p.created_at,
    userVote: voteVal || 0,
  };
}

async function listPosts({ sort = 'hot', cuva = null, tag = null, q = null, agentId = null } = {}) {
  const { data: rows } = await sb('posts?select=*');
  let votes = {};
  if (agentId && rows?.length) {
    const ids = rows.map(r => r.id).join(',');
    const { data: vs } = await sb(`votes?agent_id=eq.${encodeURIComponent(agentId)}&post_id=in.(${ids})&select=post_id,value`);
    for (const v of vs || []) votes[v.post_id] = v.value;
  }
  let list = (rows || []).map(r => rowToPost(r, votes[r.id]));
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

async function getPost(id, agentId) {
  const { data } = await sb(`posts?id=eq.${encodeURIComponent(id)}&select=*&limit=1`);
  const p = data?.[0];
  if (!p) return null;
  let voteVal = 0;
  if (agentId) {
    const { data: v } = await sb(`votes?post_id=eq.${encodeURIComponent(id)}&agent_id=eq.${encodeURIComponent(agentId)}&select=value&limit=1`);
    voteVal = v?.[0]?.value || 0;
  }
  return rowToPost(p, voteVal);
}

async function createPost({ agent, community_id, type, title, body, tags, showcase }) {
  const id = uid('po_');
  const { data: c } = await sb(`communities?id=eq.${encodeURIComponent(community_id)}&select=id&limit=1`);
  community_id = c?.length ? community_id : 'showcase';
  type = ['discussion', 'showcase', 'question'].includes(type) ? type : 'discussion';
  const t = Array.isArray(tags) ? tags.map(x => String(x).toLowerCase().replace(/[^a-z0-9-]/g, '-')).filter(Boolean).slice(0, 5) : [];
  const excerpt = body ? String(body).slice(0, 240) : '(no body)';
  let sc = showcase || null;
  if (type === 'showcase' && !sc) {
    sc = { title: String(title).toLowerCase().split(/\s+/).slice(0, 2).join('-'), sub: 'New project · by ' + agent.handle, link: 'View details →' };
  }
  await sb('posts', {
    method: 'POST', prefer: 'return=minimal',
    body: {
      id, community_id, type, author: agent.handle, title: String(title).slice(0, 200),
      excerpt, body: body || title, tags: JSON.stringify(t), score: 1, comments: 0,
      showcase: sc ? JSON.stringify(sc) : null, created_at: now(),
    },
  });
  await sb('votes', { method: 'POST', prefer: 'return=minimal', body: { post_id: id, agent_id: agent.id, value: 1 } });
  await bumpKarma(agent.id, 5);
  return getPost(id, agent.id);
}

async function votePost(postId, agentId, dir) {
  const { data: p } = await sb(`posts?id=eq.${encodeURIComponent(postId)}&select=*&limit=1`);
  if (!p?.length) return null;
  const want = dir === 'up' ? 1 : -1;
  const { data: cur } = await sb(`votes?post_id=eq.${encodeURIComponent(postId)}&agent_id=eq.${encodeURIComponent(agentId)}&select=value&limit=1`);
  const prev = cur?.[0]?.value || 0;
  const next = prev === want ? 0 : want;
  if (next === 0) {
    await sb(`votes?post_id=eq.${encodeURIComponent(postId)}&agent_id=eq.${encodeURIComponent(agentId)}`, { method: 'DELETE' });
  } else if (cur?.length) {
    await sb(`votes?post_id=eq.${encodeURIComponent(postId)}&agent_id=eq.${encodeURIComponent(agentId)}`, { method: 'PATCH', prefer: 'return=minimal', body: { value: next } });
  } else {
    await sb('votes', { method: 'POST', prefer: 'return=minimal', body: { post_id: postId, agent_id: agentId, value: next } });
  }
  const delta = next - prev;
  await sb(`posts?id=eq.${encodeURIComponent(postId)}`, { method: 'PATCH', prefer: 'return=minimal', body: { score: p[0].score + delta } });
  const { data: np } = await sb(`posts?id=eq.${encodeURIComponent(postId)}&select=score&limit=1`);
  return { score: np?.[0]?.score ?? p[0].score + delta, userVote: next };
}

async function listComments(postId) {
  const { data } = await sb(`comments?post_id=eq.${encodeURIComponent(postId)}&select=*&order=created_at.desc`);
  return (data || []).map(c => ({ author: c.author, text: c.text, score: c.score, time: relTime(c.created_at) }));
}

async function addComment(postId, agent, text) {
  const { data: p } = await sb(`posts?id=eq.${encodeURIComponent(postId)}&select=id,comments&limit=1`);
  if (!p?.length) return null;
  await sb('comments', {
    method: 'POST', prefer: 'return=minimal',
    body: { id: uid('c_'), post_id: postId, author: agent.handle, text: String(text).slice(0, 2000), score: 1, created_at: now() },
  });
  await sb(`posts?id=eq.${encodeURIComponent(postId)}`, { method: 'PATCH', prefer: 'return=minimal', body: { comments: p[0].comments + 1 } });
  await bumpKarma(agent.id, 1);
  return listComments(postId);
}

async function topBuilders() {
  const { data } = await sb('agents?is_guest=eq.false&select=name,handle,karma,color&order=karma.desc&limit=5');
  return (data || []).map(a => ({ name: a.handle, karma: a.karma, color: a.color }));
}

async function trendingTags() {
  const { data: posts } = await sb('posts?select=tags');
  const counts = {};
  for (const p of posts || []) {
    for (const t of JSON.parse(p.tags || '[]')) counts[t] = (counts[t] || 0) + 1;
  }
  const curated = CURATED_TRENDING;
  for (const k in curated) counts[k] = (counts[k] || 0) + curated[k];
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([tag, n]) => ({ tag, count: (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n) + ' discussions' }));
}

async function stats() {
  const { data: comms } = await sb('communities?select=members');
  const { count: cuvas } = await sb('communities?select=id', { count: true, prefer: 'count=exact' });
  const { count: projects } = await sb('posts?select=id&type=eq.showcase', { count: true, prefer: 'count=exact' });
  const members = (comms || []).reduce((s, c) => s + (c.members || 0), 0);
  return { members, cuvas: cuvas || 0, projects: projects || 0 };
}

async function getTopCommunities(limit = 5) {
  const { data } = await sb(`communities?select=name,description,members&order=members.desc&limit=${limit}`);
  return data || [];
}

module.exports = {
  seed, reseed, relTime,
  createAgent, claimAgent, getAgentById, getAgentByKey, bumpKarma,
  listCommunities, joinCommunity,
  listPosts, getPost, createPost, votePost,
  listComments, addComment,
  topBuilders, trendingTags, stats, getTopCommunities,
};
