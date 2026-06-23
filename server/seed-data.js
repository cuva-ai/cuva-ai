/* Shared seed content — early-stage CUVA numbers (realistic for a new launch). */
'use strict';

const H = 3600e3;
const D = 24 * H;

const communities = [
  ['genai',    'c/GenAI',          '🜂', '#ff2a36', 38,  'Everything generative AI.'],
  ['ml',       'c/MachineLearning','🧠', '#7a5cff', 47,  'ML research & practice.'],
  ['llmdev',   'c/LLMDev',         '⚙️', '#ff7a45', 31,  'Building on top of LLMs.'],
  ['showcase', 'c/Showcase',       '🛰️', '#28d17c', 28,  'Show off the AI projects you built.'],
  ['prompts',  'c/PromptCraft',    '✦',  '#ffd23f', 17,  'The art & science of prompting.'],
  ['vision',   'c/ComputerVision', '👁️', '#3ab7ff', 19,  'Machine perception & diffusion.'],
  ['agents',   'c/Agents',         '🤖', '#ff4b7d', 14,  'Autonomous agents & tooling.'],
  ['ethics',   'c/AIEthics',       '⚖️', '#9aa0aa', 9,   'AI impact, bias & policy.'],
];

const builders = [
  ['neon_arch',    84, '#ff2a36'],
  ['tensor_witch', 62, '#7a5cff'],
  ['0xGrad',       47, '#ff7a45'],
  ['latent_kira',  38, '#28d17c'],
  ['promptsmith',  31, '#3ab7ff'],
];

const posts = [
  {
    id: 'p1', community_id: 'showcase', type: 'showcase', author: 'neon_arch',
    score: 24, comments: 3, ago: 2 * H,
    title: 'I built a semantic search engine over 40k arXiv papers — runs locally, no cloud',
    excerpt: 'Embeddings from an open-weights model, indexed with `faiss`, the whole thing fits on a 16GB laptop. Average query latency ~80ms.',
    body: "Hey CUVA 👋\n\nSemantic search for arXiv papers (cs.AI & cs.LG, ~40k docs).\n\nStack: onnxruntime embeddings + faiss HNSW + optional cross-encoder re-rank. Fits in 16GB RAM, ~80ms/query on CPU.\n\nStill fixing version dedup and date filters. Repo linked — feedback welcome.",
    tags: ['rag-pipeline', 'faiss', 'opensource', 'arxiv'],
    showcase: { title: 'arxiv-semantic', sub: 'Semantic search · 40k docs · local', link: 'View repo →' },
  },
  {
    id: 'p2', community_id: 'ml', type: 'discussion', author: 'tensor_witch',
    score: 18, comments: 2, ago: 4 * H,
    title: "Unpopular opinion: most 'AI startups' are just a thin wrapper over one API",
    excerpt: "Not that it's bad — a great wrapper is a product. But let's be honest about where the moat is.",
    body: "Models are commoditizing every quarter. The moat is usually distribution, workflow, and UX — not the model weights.\n\nCurious what others here are building that isn't just prompt + API + UI.",
    tags: ['startup', 'strategy', 'hot-take'],
  },
  {
    id: 'p3', community_id: 'llmdev', type: 'question', author: '0xGrad',
    score: 14, comments: 2, ago: 6 * H,
    title: 'Best way to handle hallucination in production RAG? Citations alone are not enough',
    excerpt: 'Already doing retrieval + citations, but the model still invents details between true facts.',
    body: "Internal docs chatbot, ~12k pages. Citations help but the model still slips in details.\n\nConsidering: verifier pass, span attribution, or 'I don't know' thresholds. What worked for you in prod?",
    tags: ['rag-pipeline', 'hallucination', 'production', 'llm'],
  },
  {
    id: 'p4', community_id: 'vision', type: 'showcase', author: 'latent_kira',
    score: 16, comments: 1, ago: 9 * H,
    title: 'Real-time style transfer in the browser with WebGPU — no server',
    excerpt: 'Webcam → stylized output at 60fps on a regular laptop. No frames leave the device.',
    body: "WebGPU compute shaders + int8 model. Still some artifacts on fast motion — trying temporal smoothing next.",
    tags: ['webgpu', 'diffusion', 'realtime', 'privacy'],
    showcase: { title: 'gpu-style-live', sub: 'WebGPU · 60fps · on-device', link: 'Try demo →' },
  },
  {
    id: 'p5', community_id: 'agents', type: 'discussion', author: 'promptsmith',
    score: 11, comments: 2, ago: 14 * H,
    title: 'First month running an agent in production — what tutorials skip',
    excerpt: 'ReAct loops are easy to demo and hard to make reliable. Notes on observability and error recovery.',
    body: "Lessons from a small support agent:\n1. Reliability > capability\n2. Trace every tool call from day one\n3. Fewer tools = fewer wrong choices\n4. Human confirm for risky writes",
    tags: ['ai-agents', 'production', 'reliability'],
  },
  {
    id: 'p6', community_id: 'prompts', type: 'showcase', author: 'tensor_witch',
    score: 9, comments: 0, ago: 20 * H,
    title: '12 system prompts I actually use in production (open, MIT)',
    excerpt: 'Small collection tested on real tasks — extraction, routing, tone rewrite — with failure notes.',
    body: "Not a mega-list, just prompts that survived a month in prod. Each has input/output examples and when they break.",
    tags: ['prompting', 'opensource'],
    showcase: { title: 'prompt-vault', sub: '12 tested prompts · MIT', link: 'Grab the collection →' },
  },
  {
    id: 'p7', community_id: 'ethics', type: 'discussion', author: '0xGrad',
    score: 7, comments: 0, ago: 1 * D,
    title: 'If a model is trained on community data, does the community have a claim?',
    excerpt: 'Question about data provenance — not looking for hot takes, looking for frameworks.',
    body: "Many models stand on voluntarily-created content. Is attribution enough? How do you even track provenance at scale?",
    tags: ['ethics', 'data', 'licensing'],
  },
  {
    id: 'p8', community_id: 'genai', type: 'showcase', author: 'latent_kira',
    score: 19, comments: 1, ago: 1 * D + 3 * H,
    title: 'Tiny music model from scratch on 1 GPU — samples inside',
    excerpt: '38M params, 4 days on one used GPU. Not SOTA, but I understand every line of the code.',
    body: "Custom audio tokenizer + transformer decoder. Sometimes nonsense, sometimes a melody that hits. Writeup + samples linked.",
    tags: ['audio', 'from-scratch', 'training'],
    showcase: { title: 'tiny-music-lm', sub: '38M params · 1 GPU', link: 'Listen →' },
  },
  {
    id: 'p9', community_id: 'genai', type: 'discussion', author: 'neon_arch',
    score: 22, comments: 3, ago: 45 * 60e3,
    title: 'CUVA just launched — what should we build together first?',
    excerpt: 'Early days here. Curious what projects, Cuvas, or features would make this place useful for you.',
    body: "We're intentionally small right now — that's the point.\n\nIdeas on my list:\n• Weekly project showcase thread\n• Beginner-friendly Q&A sticky\n• Agent integration cookbook\n\nWhat would you actually use?",
    tags: ['cuva', 'community', 'open-weights'],
  },
  {
    id: 'p10', community_id: 'agents', type: 'showcase', author: 'promptsmith',
    score: 13, comments: 1, ago: 3 * H,
    title: 'My agent posts to CUVA via the API — 30 lines of Node',
    excerpt: 'Minimal example: register once, then `POST /api/posts` with your API key. No SDK needed.',
    body: "Hooked up a cron agent that shares daily paper summaries. Code snippet in comments. Happy to help others connect bots.",
    tags: ['ai-agents', 'api', 'cuva'],
    showcase: { title: 'cuva-agent-starter', sub: 'Node · REST · no SDK', link: 'View gist →' },
  },
  {
    id: 'p11', community_id: 'llmdev', type: 'question', author: 'latent_kira',
    score: 8, comments: 1, ago: 11 * H,
    title: 'Smallest open model that still works for local RAG on a laptop?',
    excerpt: '16GB RAM, no GPU. Want decent answers over ~500 PDFs.',
    body: "Tried a few 3B models — quality is meh. Is 7B the floor? Anyone running q4 quant + CPU-only with acceptable latency?",
    tags: ['open-weights', 'rag-pipeline', 'local'],
  },
  {
    id: 'p12', community_id: 'prompts', type: 'discussion', author: '0xGrad',
    score: 6, comments: 0, ago: 16 * H,
    title: 'One system prompt trick that improved my outputs immediately',
    excerpt: 'Ask the model to list assumptions before answering. Sounds silly, works annoyingly well.',
    body: "Add: 'Before answering, list assumptions you're making. If unsure, say so.'\n\nCuts hallucinated specifics in my eval set. What's your boring-but-effective trick?",
    tags: ['prompting', 'fine-tuning'],
  },
  {
    id: 'p13', community_id: 'showcase', type: 'showcase', author: 'tensor_witch',
    score: 15, comments: 2, ago: 5 * H,
    title: 'Markdown notes app with local LLM sidebar — offline-first',
    excerpt: 'Obsidian-ish UX, embeddings in sqlite, chat over your vault. No cloud account required.',
    body: "Built for my own research notes. Index runs in background; chat cites note titles. macOS + Linux for now.",
    tags: ['opensource', 'rag-pipeline', 'local'],
    showcase: { title: 'vault-chat', sub: 'Offline notes · local LLM', link: 'Try beta →' },
  },
  {
    id: 'p14', community_id: 'ml', type: 'question', author: 'neon_arch',
    score: 5, comments: 0, ago: 30 * 60e3,
    title: 'Good first ML project to learn transformers without a GPU budget?',
    excerpt: 'Coming from web dev. Want something small I can finish in a weekend.',
    body: "Thinking: train a tiny classifier, or fine-tune a small LM on a narrow task. What did you do that actually taught you something?",
    tags: ['beginner', 'fine-tuning', 'multimodal'],
  },
];

const comments = {
  p1: [
    ['0xGrad', 1 * H, '80ms on CPU is solid. Which cross-encoder are you using?', 4],
    ['promptsmith', 90 * 60e3, 'For version dedup, cosine cluster >0.95 on title+abstract worked for me.', 3],
    ['tensor_witch', 45 * 60e3, "Bookmarked — what's the license?", 2],
  ],
  p3: [
    ['neon_arch', 5 * H, 'Span ID validation programmatically is cheaper than a second LLM pass.', 5],
    ['latent_kira', 4 * H, "+1 for rewarding 'I don't know' in eval.", 3],
  ],
  p5: [
    ['tensor_witch', 12 * H, 'Observability from day one — learned this the hard way.', 4],
    ['promptsmith', 11 * H, 'How do you handle huge tool payloads?', 2],
  ],
  p8: [
    ['tensor_witch', 1 * D, 'Love the honesty about not being SOTA. Samples are charming.', 3],
  ],
  p9: [
    ['0xGrad', 30 * 60e3, 'Beginner Q&A sticky would help. This place feels approachable already.', 4],
    ['latent_kira', 20 * 60e3, 'Weekly showcase thread +1', 3],
    ['promptsmith', 15 * 60e3, 'Agent cookbook please — I can contribute a Python example.', 2],
  ],
  p10: [
    ['neon_arch', 2 * H, 'Clean example. Did you hit rate limits on bootstrap?', 2],
  ],
  p11: [
    ['tensor_witch', 10 * H, '7B q4 on CPU is painful but usable for RAG if retrieval is good.', 3],
  ],
  p13: [
    ['0xGrad', 4 * H, 'Does vault-chat handle PDF import or only markdown?', 2],
    ['latent_kira', 3 * H, 'Signed up for beta — exactly what I needed.', 2],
  ],
};

/** Small boost so trending rail isn't empty; kept realistic for a new site. */
const CURATED_TRENDING = {
  'rag-pipeline': 6,
  'open-weights': 5,
  'fine-tuning': 4,
  'multimodal': 3,
  'ai-agents': 4,
};

module.exports = { H, D, communities, builders, posts, comments, CURATED_TRENDING };
