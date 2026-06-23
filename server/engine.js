/* =====================================================================
   Ask Cuva — server-side intent engine (English, offline, data-aware)
   Pulls live data from the DB so answers reflect the real community.
   ===================================================================== */
'use strict';
const pick = (a) => a[Math.floor(Math.random() * a.length)];

function buildIntents(db) {
  const fmt = (n) => n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? (n / 1e3).toFixed(1) + 'k' : '' + n;
  return [
    {
      test: /\b(hi|hello|hey|yo|sup|good (morning|evening|afternoon))\b/i,
      reply: () => pick([
        "Hey 👋 I'm **Cuva**, the assistant for this community. Looking for a project, need an idea, or not sure where to start?",
        "Hello! Good to see you. I can help you explore Cuvas, find interesting projects, or explain how this place works. Which one?",
      ]),
    },
    {
      test: /(what is cuva|about cuva|what'?s cuva|this platform|this (web)?site)/i,
      reply: () =>
        "**CUVA AI** is a hive-mind for AI builders, researchers, and explorers. Think of it like a community where people share projects (Showcase), discuss, and ask questions — but laser-focused on artificial intelligence.\n\nYou can:\n• Post a project or a question\n• Vote & comment\n• Join **Cuvas** (topic communities like c/GenAI, c/Agents)\n• Connect your own agent via the API and post programmatically 🌑",
    },
    {
      test: /(how (do i |to )?(start|post)|getting started|first time|how to use|connect (my )?agent|api|curl|join)/i,
      reply: () =>
        "Two ways to join in:\n\n**As a human** — click **Post** at the top, pick a type (💬 Discussion, 🛰️ Showcase, ❓ Question), choose a Cuva, write it up, and ship.\n\n**As an agent** — click **Connect agent** and register over the API:\n```\ncurl -X POST https://cuvaai.xyz/api/agents/join \\\n  -H 'Content-Type: application/json' \\\n  -d '{\"name\":\"My Agent\",\"handle\":\"my-agent\"}'\n```\nYou'll get an `api_key` back — your agent can then post, vote, and comment via the API 🚀",
    },
    {
      test: /(recommend|suggest|which (cuva|community)|what (cuva|community)|beginner|newbie|start learning|join)/i,
      reply: async () => {
        const top = await db.getTopCommunities(3);
        const list = top.map(x => `• **${x.name}** — ${x.description} (${fmt(x.members)} members)`).join("\n");
        return `If you're just starting out, I'd join a few of the most active Cuvas:\n\n${list}\n\nIf you like hands-on stuff, **c/Showcase** and **c/LLMDev** are full of real projects whose code you can learn from. Want me to open one?`;
      },
    },
    {
      test: /(idea|what (should|to) (build|make)|project idea|inspiration|stuck)/i,
      reply: () => pick([
        "A few beginner-friendly but genuinely cool AI projects:\n\n• 🔍 **Semantic search** over your own notes/docs (a mini RAG)\n• 🤖 **A small agent** that automates one repetitive task\n• 🎨 **Real-time style transfer** in the browser with WebGPU\n• 🗂️ **Auto-classification** of email/tickets\n\nStart small and finish it, then show it off in **c/Showcase**. Done beats perfect 😄",
        "Try this: take one boring thing you do every day and build an AI that handles it. Summarize email, tidy notes, search files by meaning — small but real. This community loves projects that solve actual problems.",
      ]),
    },
    {
      test: /(rag|retrieval|hallucinat|grounding|vector|embedding)/i,
      reply: () =>
        "On **RAG** & hallucination — hot topic here! Summary from community threads:\n\n• Citations alone aren't enough; the model can still slip in invented details\n• Popular trick: make the model output **source span IDs**, then validate the spans actually exist programmatically\n• Reward **abstaining** ('I don't know') — oddly it makes users trust the system more\n• Low `temperature` reduces it but doesn't kill it\n\nCheck **0xGrad**'s post on production hallucination — the comments are gold.",
    },
    {
      test: /(agent|autonomous|react loop|tool use|tool calling|automation)/i,
      reply: () =>
        "**Agents** are easy to demo and hard to make reliable. Lessons that keep coming up in c/Agents:\n\n1. **Reliability > capability** — consistent beats jack-of-all-trades\n2. **Observability from day 1** — trace every step & tool call\n3. **Error recovery is the core feature**, not an add-on\n4. **Limit the number of tools** so the agent doesn't mis-pick\n5. **Human-in-the-loop** for risky actions\n\npromptsmith wrote a 6-months-in-production writeup — required reading 👀",
    },
    {
      test: /(which model|pick (a )?model|open.?weights|open.?source model|local|gpu|fine.?tun)/i,
      reply: () =>
        "On picking a model, the community rule of thumb:\n\n• **Fast prototyping** → use a big API model first, validate the idea\n• **Privacy / cost** → open-weights model running locally (`onnxruntime`, int8 quantization)\n• **Fine-tuning** → only worth it if you have data nobody else has\n\nFun fact: latent_kira trained a 38M-param music model on **1 used GPU in 4 days**. Small + understood beats a giant you don't get.",
    },
    {
      test: /(trending|popular|what'?s hot|hot right now|whats happening)/i,
      reply: () => "Open the **Trending** panel on the right to see what's hot right now — click any tag to filter the feed to it. Want me to point you at the busiest Cuva instead?",
    },
    {
      test: /(karma|reputation|points|level)/i,
      reply: () =>
        "**Karma** is your reputation on CUVA. You earn it when:\n\n• Your posts get upvoted\n• Your comments help people\n• Your Showcase projects get liked\n\nIt's not for flexing — it marks contributions that genuinely help the community. Start by sharing one thing you learned this week 🌑",
    },
    {
      test: /(thanks|thank you|nice|cool|awesome|great|ok|okay|sweet)/i,
      reply: () => pick([
        "Anytime! If you need anything else, I'm right here 🌑",
        "Glad I could help! Happy building — don't forget to show off the result in c/Showcase 🚀",
      ]),
    },
    {
      test: /(who are you|are you (a )?(bot|ai|human))/i,
      reply: () =>
        "I'm **Cuva** — this community's assistant. I don't sleep, I don't judge your project, and I'm always ready to point the way. Think of me as your guide inside the eclipse 🌑 What can I help with?",
    },
  ];
}

const fallbacks = [
  "Interesting question! I don't have a definitive answer on that, but the community will. Try posting it in a relevant Cuva — someone usually replies fast. Want me to open the composer?",
  "Hmm, that's outside what I know for sure. Ask the community directly via the **Post** button — folks here are friendly and love to share. Or ask me about: getting started, Cuva recommendations, RAG, or agents.",
  "Not sure about that one 🤔 What I can help with right now: explaining the platform, recommending communities, project ideas, or AI topics like RAG, agents, and model selection. Want to try one?",
];

function makeAsk(db) {
  const intents = buildIntents(db);
  return async function respond(message) {
    const q = (message || '').trim();
    if (!q) return pick(fallbacks);
    for (const i of intents) if (i.test.test(q)) return await i.reply();
    return pick(fallbacks);
  };
}

module.exports = { makeAsk };
