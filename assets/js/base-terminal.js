/* Base Signal Terminal — B20, Beryl, Reth 2.0, x402, Base MCP */
(function () {
  const el = document.getElementById("baseTerminal");
  if (!el) return;

  const BLOCKS = [
    {
      cmd: "cuva signal --network base --beryl",
      lines: [
        { t: "ok", s: "Base Beryl · native issuance platform on Base" },
        { t: "info", s: "B20 standard live — ERC-20 compatible Rust precompiles" },
        { t: "info", s: "Mainnet activation: 2026-06-25 18:00 UTC · Sepolia: 2026-06-18" },
        { t: "dim", s: "Source: docs.base.org/base-chain/specs/upgrades/beryl" },
      ],
    },
    {
      cmd: "cuva b20 --factory createB20",
      lines: [
        { t: "ok", s: "Deploy tokens via B20 Factory — one transaction, no custom contract" },
        { t: "info", s: "Variants: ASSET (6–18 decimals) · STABLECOIN (fixed 6, ISO code)" },
        { t: "info", s: "Built-in: roles, supply caps, pause, policy gating, permit" },
        { t: "cmd", s: "base-forge script script/CreateToken.s.sol --broadcast" },
        { t: "dim", s: "Guide: docs.base.org/get-started/launch-b20-token" },
      ],
    },
    {
      cmd: "cuva reth --perf",
      lines: [
        { t: "ok", s: "Reth 2.0 · pipelined execution + tiered storage" },
        { t: "info", s: "~1.7 Gigagas/s · ~240 GB disk · minimal mode <300 GB sync" },
        { t: "info", s: "Base Beryl ships Reth V2: ~50% disk reduction, +33% throughput" },
        { t: "dim", s: "Source: paradigm.xyz/2026/04/releasing-reth-2-0" },
      ],
    },
    {
      cmd: "cuva mcp --x402 pay",
      lines: [
        { t: "ok", s: "Base MCP · give your AI assistant a wallet on Base" },
        { t: "info", s: "Send · swap · sign · contract calls · batch approvals" },
        { t: "warn", s: "x402: pay USDC for API requests — agent-native micropayments" },
        { t: "info", s: "Endpoint: mcp.base.org · every write needs user approval" },
        { t: "link", s: "Open Agent Studio → /mcp-base.html", href: "/mcp-base.html" },
      ],
    },
  ];

  let blockIdx = 0;
  let lineIdx = 0;
  let charIdx = 0;
  let history = [];
  let typing = true;

  function esc(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function render() {
    el.innerHTML = history.map(h => `<div class="bt-line">${h}</div>`).join("")
      + (typing ? `<div class="bt-line bt-line--active">${currentHtml()}</div>` : "");
    el.scrollTop = el.scrollHeight;
  }

  function currentHtml() {
    const b = BLOCKS[blockIdx];
    const prefix = `<span class="bt-prompt">$</span> <span class="bt-cmd">${esc(b.cmd.slice(0, charIdx))}</span>`;
    if (charIdx < b.cmd.length) return prefix + `<span class="bt-cursor">▌</span>`;
    let out = `<span class="bt-prompt">$</span> <span class="bt-cmd">${esc(b.cmd)}</span>`;
    for (let i = 0; i < lineIdx; i++) {
      const ln = b.lines[i];
      out += lineHtml(ln, true);
    }
    if (lineIdx < b.lines.length) {
      const ln = b.lines[lineIdx];
      const partial = ln.s.slice(0, charIdx - b.cmd.length);
      out += lineHtml({ ...ln, s: partial }, false);
      out += `<span class="bt-cursor">▌</span>`;
    }
    return out;
  }

  function lineHtml(ln, done) {
    const cls = `bt-out bt-out--${ln.t}`;
    let inner = esc(ln.s);
    if (ln.href && done) inner = `<a href="${ln.href}" class="bt-link">${inner}</a>`;
    return `<div class="${cls}">${inner}</div>`;
  }

  function tick() {
    const b = BLOCKS[blockIdx];
    const totalCmd = b.cmd.length;
    if (charIdx < totalCmd) {
      charIdx += 2;
      render();
      return;
    }
    if (lineIdx < b.lines.length) {
      const ln = b.lines[lineIdx];
      const target = totalCmd + ln.s.length;
      if (charIdx < target) {
        charIdx += 3;
        render();
        return;
      }
      lineIdx++;
      charIdx = totalCmd;
      render();
      return;
    }
    history.push(
      `<span class="bt-prompt">$</span> <span class="bt-cmd">${esc(b.cmd)}</span>`
      + b.lines.map(ln => lineHtml(ln, true)).join("")
    );
    blockIdx = (blockIdx + 1) % BLOCKS.length;
    lineIdx = 0;
    charIdx = 0;
    if (history.length > 28) history = history.slice(-20);
    if (blockIdx === 0) history.push(`<div class="bt-out bt-out--dim">— signal loop · ${new Date().toLocaleTimeString()} —</div>`);
    render();
  }

  render();
  setInterval(tick, 45);
})();
