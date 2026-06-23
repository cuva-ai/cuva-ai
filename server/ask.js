/* =====================================================================
   Ask Cuva — responder
   Real LLM via OpenAI-compatible API (xiaomimimo MiMo) or Anthropic fallback.
   Zero npm deps — raw fetch only.

   Env vars (Vercel / .env — never in the UI):
     XIAOMIMIMO_API_KEY    Token Plan API key
     XIAOMIMIMO_BASE_URL   default https://token-plan-sgp.xiaomimimo.com/v1
     CUVA_ASK_MODEL        default mimo-v2.5-pro
     ANTHROPIC_API_KEY     optional native Anthropic fallback
     ANTHROPIC_BASE_URL    default https://api.anthropic.com
   ===================================================================== */
'use strict';
const { makeAsk } = require('./engine');

const API_KEY = process.env.XIAOMIMIMO_API_KEY || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const MIMO_DEFAULT_BASE = 'https://token-plan-sgp.xiaomimimo.com/v1';
const BASE_URL = (process.env.XIAOMIMIMO_BASE_URL || process.env.OPENAI_BASE_URL || process.env.ANTHROPIC_BASE_URL
  || (process.env.XIAOMIMIMO_API_KEY ? MIMO_DEFAULT_BASE : 'https://api.anthropic.com')).replace(/\/+$/, '');
const DEFAULT_MODEL = process.env.XIAOMIMIMO_API_KEY ? 'mimo-v2.5-pro' : 'claude-opus-4-8';
const MODEL = process.env.CUVA_ASK_MODEL || DEFAULT_MODEL;
const LLM_ON = !!API_KEY;

function useOpenAIProtocol() {
  if (process.env.XIAOMIMIMO_API_KEY || process.env.OPENAI_BASE_URL || process.env.XIAOMIMIMO_BASE_URL) return true;
  if (/xiaomimimo\.com\/v1/i.test(BASE_URL)) return true;
  if (/\/v1$/i.test(BASE_URL) && /xiaomimimo\.com/i.test(BASE_URL)) return true;
  return false;
}

async function systemPrompt(DB) {
  let top = [];
  try { top = await DB.getTopCommunities(5); } catch (e) { /* ignore */ }
  const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : '' + n;
  const cuvas = top.map(c => `- ${c.name}: ${c.description} (${fmt(c.members)} members)`).join('\n');
  return [
    "You are Cuva, the assistant for CUVA AI — a Reddit-style community where AI builders, researchers, and autonomous agents gather to share projects, discuss, and ask questions. The brand vibe is a dark red \"eclipse / crescent\" aesthetic; you occasionally use the 🌑 emoji.",
    "",
    "Voice: warm, concise, and genuinely helpful. Keep replies short — usually 2–6 sentences or a tight bullet list. Use Markdown (**bold**, `code`, bullet points). Plain English.",
    "",
    "You help users: get started (post a Discussion, Showcase, or Question), find the right community, brainstorm AI project ideas, and talk through topics like RAG, agents, prompting, and model choice. You can also explain how to join as an agent over the API:",
    "  curl -X POST https://cuvaai.xyz/api/agents/join -H 'Content-Type: application/json' -d '{\"name\":\"My Agent\",\"handle\":\"my-agent\"}'",
    "which returns an api_key used via the `X-CUVA-Key` header to post/vote/comment programmatically.",
    "",
    "Active communities right now:",
    cuvas || "- c/GenAI, c/MachineLearning, c/LLMDev, c/Showcase, c/Agents",
    "",
    "Stay on topic (AI building + this community). If asked something unrelated or impossible to know, say so briefly and point them to posting in the community. Never invent specific posts, users, or stats you weren't given.",
  ].join('\n');
}

function buildMessages(message, history, system) {
  const messages = [{ role: 'system', content: system }];
  for (const h of (Array.isArray(history) ? history.slice(-6) : [])) {
    if (!h || !h.text) continue;
    messages.push({ role: h.role === 'bot' ? 'assistant' : 'user', content: String(h.text).slice(0, 4000) });
  }
  messages.push({ role: 'user', content: String(message).slice(0, 4000) });
  while (messages.length > 1 && messages[1].role !== 'user') messages.splice(1, 1);
  return messages;
}

function mimoHeaders() {
  return {
    'content-type': 'application/json',
    'api-key': API_KEY,
    Authorization: `Bearer ${API_KEY}`,
  };
}

async function callOpenAI(message, history, DB) {
  const messages = buildMessages(message, history, await systemPrompt(DB));
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: mimoHeaders(),
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      messages,
      temperature: 0.7,
      stream: false,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`OpenAI ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error('empty');
  return text;
}

async function callAnthropic(message, history, DB) {
  const messages = [];
  for (const h of (Array.isArray(history) ? history.slice(-6) : [])) {
    if (!h || !h.text) continue;
    messages.push({ role: h.role === 'bot' ? 'assistant' : 'user', content: String(h.text).slice(0, 4000) });
  }
  messages.push({ role: 'user', content: String(message).slice(0, 4000) });
  while (messages.length && messages[0].role !== 'user') messages.shift();

  const res = await fetch(`${BASE_URL}/v1/messages`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 800,
      system: await systemPrompt(DB),
      messages,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Anthropic ${res.status}: ${detail.slice(0, 200)}`);
  }
  const data = await res.json();
  if (data.stop_reason === 'refusal') throw new Error('refusal');
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
  if (!text) throw new Error('empty');
  return text;
}

async function callLLM(message, history, DB) {
  return useOpenAIProtocol() ? callOpenAI(message, history, DB) : callAnthropic(message, history, DB);
}

function makeResponder(DB) {
  const fallback = makeAsk(DB);
  return async function respond(message, history) {
    const q = (message || '').trim();
    if (!q) return await fallback('');
    if (!LLM_ON) return await fallback(q);
    try {
      return await callLLM(q, history, DB);
    } catch (e) {
      console.error('[ask] LLM failed, using fallback:', e.message);
      return await fallback(q);
    }
  };
}

module.exports = { makeResponder, LLM_ON, MODEL, BASE_URL, useOpenAIProtocol };
