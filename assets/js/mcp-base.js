/* CUVA Agent Studio — Base MCP + B20 */
(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const LS = "cuva_studio_v2";

  const TOOLS = [
    { id: "send", label: "Send & receive", desc: "Native + ERC-20, ENS, basenames" },
    { id: "swap", label: "Swap tokens", desc: "Supported pairs on Base" },
    { id: "sign", label: "Sign messages", desc: "EIP-712 and plain text" },
    { id: "calls", label: "Contract calls", desc: "Batch via send_calls" },
    { id: "x402", label: "x402 payments", desc: "Pay USDC for API requests" },
    { id: "balance", label: "Balance checks", desc: "Read before write" },
  ];

  const NET = {
    "base-mainnet": { label: "Base Mainnet", chain: "8453", rpc: "https://mainnet.base.org", beryl: "2026-06-25" },
    "base-sepolia": { label: "Base Sepolia", chain: "84532", rpc: "https://sepolia.base.org", beryl: "2026-06-18" },
  };

  let state = loadState();

  function defaultState() {
    return {
      name: "Cuva Agent",
      handle: "cuva-agent",
      tokenName: "CUVA Token",
      tokenSymbol: "CUVA",
      network: "base-sepolia",
      endpoint: "https://mcp.base.org",
      variant: "asset",
      decimals: 18,
      supplyCap: 1000000,
      uncapped: false,
      minted: 0,
      tools: Object.fromEntries(TOOLS.map(t => [t.id, true])),
      b20Aware: true,
      wallet: null,
      connected: false,
      apiKey: null,
      agentId: null,
      activity: [],
      roles: { admin: 1, minter: 1, pauser: 0 },
    };
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(LS);
      return raw ? { ...defaultState(), ...JSON.parse(raw) } : defaultState();
    } catch { return defaultState(); }
  }

  function saveState() {
    localStorage.setItem(LS, JSON.stringify(state));
  }

  function toast(msg) {
    const t = $("#studioToast");
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._id);
    toast._id = setTimeout(() => { t.hidden = true; }, 3200);
  }

  function fmt(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return n.toLocaleString();
    return String(n);
  }

  function tokenAddress() {
    const seed = (state.tokenSymbol + state.handle).toLowerCase();
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    const hex = h.toString(16).padStart(8, "0");
    return "0xB200" + hex + "cuva" + hex.slice(0, 4);
  }

  function shortAddr(a) {
    return a.slice(0, 6) + "…" + a.slice(-4);
  }

  function mcpConfig() {
    const enabled = TOOLS.filter(t => state.tools[t.id]).map(t => t.id);
    return {
      mcpServers: {
        base: {
          url: state.endpoint.replace(/\/+$/, ""),
          transport: "sse",
        },
      },
      _cuva: {
        agent: state.handle,
        network: state.network,
        chainId: NET[state.network].chain,
        tools: enabled,
        b20Token: { name: state.tokenName, symbol: state.tokenSymbol, decimals: state.decimals, variant: state.variant },
        systemContext: state.b20Aware ? berylContext() : undefined,
      },
    };
  }

  function cursorConfig() {
    return JSON.stringify({ mcpServers: { base: { url: state.endpoint.replace(/\/+$/, "") } } }, null, 2);
  }

  function berylContext() {
    return [
      "Base Beryl upgrade: B20 native token standard (ERC-20 precompiles).",
      "Mainnet Jun 25 2026 · Sepolia Jun 18 2026.",
      "Reth 2.0: ~50% disk reduction, +33% throughput on Base.",
      "x402: pay USDC for API requests via Base MCP.",
    ].join(" ");
  }

  function b20DeployScript() {
    const sym = state.tokenSymbol.replace(/[^A-Z0-9]/gi, "").slice(0, 8) || "CUVA";
    const dec = state.variant === "stable" ? 6 : state.decimals;
    const cap = state.uncapped ? "type(uint128).max" : (state.supplyCap * 10 ** dec).toString();
    if (state.variant === "stable") {
      return `// B20 Stablecoin · ${state.tokenName}\nbytes memory params = B20FactoryLib.encodeStablecoinCreateParams("${state.tokenName}", "${sym}", account, "USD");\ntoken = StdPrecompiles.B20_FACTORY.createB20(IB20Factory.B20Variant.STABLECOIN, salt, params, initCalls);`;
    }
    return `// B20 Asset · ${state.tokenName}\nbytes memory params = B20FactoryLib.encodeAssetCreateParams("${state.tokenName}", "${sym}", account, ${dec});\ninitCalls[1] = B20FactoryLib.encodeUpdateSupplyCap(${cap});\ntoken = StdPrecompiles.B20_FACTORY.createB20(IB20Factory.B20Variant.ASSET, salt, params, initCalls);`;
  }

  function logActivity(type, detail, status = "ok") {
    state.activity.unshift({ type, detail, status, ts: Date.now() });
    if (state.activity.length > 12) state.activity.pop();
    saveState();
    renderActivity();
  }

  function renderToolToggles() {
    $("#toolToggles").innerHTML = TOOLS.map(t => `
      <label class="studio-toggle">
        <span class="studio-toggle__text"><b>${t.label}</b><p>${t.desc}</p></span>
        <span class="studio-switch"><input type="checkbox" data-tool="${t.id}" ${state.tools[t.id] ? "checked" : ""} /><span></span></span>
      </label>`).join("");
  }

  function renderActivity() {
    const ul = $("#pvActivity");
    if (!state.activity.length) {
      ul.innerHTML = `<li class="pv-activity__empty">No actions yet</li>`;
      return;
    }
    ul.innerHTML = state.activity.map(a => {
      const time = new Date(a.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
      return `<li class="pv-activity__item pv-activity__item--${a.status}">
        <span class="pv-activity__type">${a.type}</span>
        <span class="pv-activity__detail">${esc(a.detail)}</span>
        <span class="pv-activity__time">${time}</span>
      </li>`;
    }).join("");
  }

  function esc(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderPreview() {
    const net = NET[state.network];
    const addr = tokenAddress();
    $("#pvName").textContent = state.tokenName;
    $("#pvSymbol").textContent = state.tokenSymbol;
    $("#pvAddr").textContent = shortAddr(addr);
    $("#pvCap").textContent = state.uncapped ? "Uncapped" : fmt(state.supplyCap);
    $("#pvMinted").textContent = fmt(state.minted);
    $("#pvDecimals").textContent = state.variant === "stable" ? "6" : state.decimals;
    $("#pvVariant").textContent = state.variant === "stable" ? "Stablecoin" : "Asset";
    $("#pvNet").textContent = net.label;
    $("#pvEndpoint").textContent = state.endpoint.replace(/^https?:\/\//, "");
    $("#pvRoles").textContent = `${state.roles.admin} admin · ${state.roles.minter} minter`;
    $("#pvConfig").textContent = JSON.stringify(mcpConfig(), null, 2);
    $("#pvIcon").textContent = state.tokenSymbol.slice(0, 1) || "C";

    const badge = $("#pvBadge");
    if (state.connected) {
      badge.textContent = "Connected";
      badge.className = "studio-status-badge studio-status-badge--live";
    } else if (state.wallet) {
      badge.textContent = "Wallet linked";
      badge.className = "studio-status-badge studio-status-badge--wallet";
    } else {
      badge.textContent = "Ready";
      badge.className = "studio-status-badge";
    }

    $("#netPillLabel").textContent = net.label;
    $$(".pv-btn").forEach(btn => {
      btn.disabled = false;
      btn.title = "";
    });

    const wb = $("#walletBtn");
    if (state.wallet) {
      wb.textContent = shortAddr(state.wallet);
      wb.classList.add("is-connected");
    } else {
      wb.textContent = "Connect Wallet";
      wb.classList.remove("is-connected");
    }
  }

  function syncForm() {
    $("#agentName").value = state.name;
    $("#agentHandle").value = state.handle;
    $("#tokenName").value = state.tokenName;
    $("#tokenSymbol").value = state.tokenSymbol;
    $("#mcpEndpoint").value = state.endpoint;
    $("#netSelect").value = state.network;
    $("#b20Aware").checked = state.b20Aware;
    $("#supplyCap").value = state.supplyCap;
    $("#uncappedToggle").checked = state.uncapped;
    $("#supplyCap").disabled = state.uncapped;

    const decRange = $("#decimalsRange");
    if (state.variant === "stable") {
      decRange.disabled = true;
      decRange.value = 6;
      $("#decimalsVal").textContent = "6";
      $("#decimalsHint").textContent = "· fixed for stablecoin";
    } else {
      decRange.disabled = false;
      decRange.value = state.decimals;
      $("#decimalsVal").textContent = state.decimals;
      $("#decimalsHint").textContent = "· Asset 6–18";
    }

    $$("[data-variant]").forEach(b => b.classList.toggle("is-active", b.dataset.variant === state.variant));
    renderToolToggles();
    renderPreview();
    renderActivity();
    renderAgentList();
    renderRoles();
  }

  function renderAgentList() {
    const list = $("#agentList");
    if (!state.connected && !state.apiKey) {
      list.innerHTML = `<li class="agent-list__empty">No agents yet — register one in Create.</li>`;
      return;
    }
    list.innerHTML = `<li class="agent-list__item">
      <div class="agent-list__avatar">${state.tokenSymbol.slice(0, 1)}</div>
      <div class="agent-list__meta">
        <b>${esc(state.name)}</b>
        <span>@${esc(state.handle)} · ${NET[state.network].label}</span>
      </div>
      <span class="agent-list__status">${state.connected ? "Connected" : "Saved"}</span>
    </li>`;
  }

  function renderRoles() {
    $("#rolesGrid").innerHTML = [
      ["DEFAULT_ADMIN", state.roles.admin, "Mint, pause, policy, role grants"],
      ["MINT_ROLE", state.roles.minter, "Issue new supply up to cap"],
      ["PAUSER_ROLE", state.roles.pauser, "Halt transfers in emergency"],
    ].map(([role, n, desc]) => `
      <div class="roles-card">
        <b>${role}</b>
        <span class="roles-count">${n} holder${n !== 1 ? "s" : ""}</span>
        <p>${desc}</p>
      </div>`).join("");
  }

  function copyText(text, msg) {
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => toast(msg));
    else toast(msg + " (copy manually)");
  }

  async function registerAgent() {
    const btn = $("#connectAgentBtn");
    btn.disabled = true;
    btn.textContent = "Connecting…";
    try {
      const r = await fetch("/api/agents/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: state.name, handle: state.handle }),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) throw new Error(data.error || "registration failed");
      state.apiKey = data.api_key || data.agent?.api_key;
      state.agentId = data.agent?.id;
      state.connected = true;
      if (data.api_key) sessionStorage.setItem("cuva_key", data.api_key);
      saveState();
      logActivity("register", `@${state.handle} registered on CUVA`, "ok");
      toast("Agent registered & MCP config saved");
    } catch (e) {
      state.connected = true;
      saveState();
      logActivity("register", `@${state.handle} saved locally (offline)`, "warn");
      toast("Saved locally — API unavailable");
    } finally {
      btn.disabled = false;
      btn.textContent = state.connected ? "Connected ✓" : "Register & connect";
      renderPreview();
      renderAgentList();
    }
  }

  function openModal(title, bodyHtml, footHtml) {
    $("#modalTitle").textContent = title;
    $("#modalBody").innerHTML = bodyHtml;
    $("#modalFoot").innerHTML = footHtml || "";
    $("#studioModal").hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    $("#studioModal").hidden = true;
    document.body.style.overflow = "";
  }

  function requireWallet() {
    if (state.wallet) return true;
    openWalletModal();
    return false;
  }

  function openWalletModal() {
    openModal("Connect Base Account", `
      <p class="modal-lead">Link your Base Account so MCP write actions can request approval.</p>
      <div class="studio-field">
        <label for="walletInput">Wallet address</label>
        <input type="text" id="walletInput" placeholder="0x…" spellcheck="false" value="${state.wallet || ""}" />
      </div>
      <p class="modal-hint">In production, connection goes through <a href="https://docs.base.org/agents/quickstart" target="_blank" rel="noopener">mcp.base.org</a> with OAuth approval flow.</p>
    `, `<button type="button" class="btn btn--primary btn--block" id="confirmWalletBtn">Link wallet</button>`);
  }

  function modalField(label, id, placeholder, type = "text") {
    return `<div class="studio-field"><label for="${id}">${label}</label><input type="${type}" id="${id}" placeholder="${placeholder}" /></div>`;
  }

  function openActionModal(action) {
    if (!requireWallet()) return;

    const forms = {
      mint: {
        title: "Mint B20 supply",
        body: modalField("Recipient", "actRecipient", state.wallet || "0x…") +
          modalField("Amount", "actAmount", "1000", "number") +
          `<p class="modal-hint">Requires MINT_ROLE · capped at ${state.uncapped ? "∞" : fmt(state.supplyCap)}</p>`,
        submit: () => {
          const amt = Math.max(0, Number($("#actAmount").value) || 0);
          if (!state.uncapped && state.minted + amt > state.supplyCap) {
            toast("Exceeds supply cap");
            return;
          }
          state.minted += amt;
          saveState();
          logActivity("mint", `${fmt(amt)} ${state.tokenSymbol} → ${shortAddr($("#actRecipient").value || state.wallet)}`);
          renderPreview();
          closeModal();
          toast("Mint submitted — awaiting Base Account approval");
        },
      },
      burn: {
        title: "Burn supply",
        body: modalField("Amount", "actAmount", "100", "number"),
        submit: () => {
          const amt = Math.min(state.minted, Math.max(0, Number($("#actAmount").value) || 0));
          state.minted -= amt;
          saveState();
          logActivity("burn", `${fmt(amt)} ${state.tokenSymbol} burned`);
          renderPreview();
          closeModal();
          toast("Burn submitted");
        },
      },
      transfer: {
        title: "Transfer",
        body: modalField("To", "actRecipient", "alice.base.eth") +
          modalField("Amount", "actAmount", "50", "number"),
        submit: () => {
          logActivity("transfer", `${$("#actAmount").value || 0} ${state.tokenSymbol} → ${$("#actRecipient").value}`);
          closeModal();
          toast("Transfer queued — policy check + approval");
        },
      },
      send: {
        title: "Send via Base MCP",
        body: modalField("Recipient", "actRecipient", "0x… or name.base.eth") +
          modalField("Amount", "actAmount", "10", "number") +
          `<div class="studio-field"><label for="actAsset">Asset</label><select id="actAsset"><option>ETH</option><option selected>USDC</option><option>${state.tokenSymbol}</option></select></div>`,
        submit: () => {
          logActivity("send", `${$("#actAmount").value} ${$("#actAsset").value} → ${$("#actRecipient").value}`);
          closeModal();
          showApproval("send", `${$("#actAmount").value} ${$("#actAsset").value} to ${$("#actRecipient").value}`);
        },
      },
      swap: {
        title: "Swap tokens",
        body: `<div class="studio-field"><label for="actFrom">From</label><select id="actFrom"><option>ETH</option><option selected>USDC</option></select></div>
          <div class="studio-field"><label for="actTo">To</label><select id="actTo"><option selected>ETH</option><option>${state.tokenSymbol}</option></select></div>
          ${modalField("Amount", "actAmount", "100", "number")}`,
        submit: () => {
          logActivity("swap", `${$("#actAmount").value} ${$("#actFrom").value} → ${$("#actTo").value}`);
          closeModal();
          showApproval("swap", `${$("#actAmount").value} ${$("#actFrom").value} → ${$("#actTo").value}`);
        },
      },
      x402: {
        title: "Pay x402 API",
        body: modalField("API URL", "actUrl", "https://api.example.com/v1/inference") +
          modalField("Amount (USDC)", "actAmount", "0.05", "number") +
          `<p class="modal-hint">Pays with USDC on ${NET[state.network].label}. Agent receives resource after payment confirms.</p>`,
        submit: () => {
          logActivity("x402", `$${$("#actAmount").value} USDC → ${new URL($("#actUrl").value || "https://api.example.com").hostname}`);
          closeModal();
          showApproval("x402", `$${$("#actAmount").value} USDC for API access`);
        },
      },
      roles: {
        title: "Manage roles",
        body: `<div class="roles-modal-list">
          <label class="studio-toggle"><span class="studio-toggle__text"><b>Grant MINT_ROLE</b><p>Allow address to mint up to supply cap</p></span>
            <span class="studio-switch"><input type="checkbox" id="grantMint" /><span></span></span></label>
          <label class="studio-toggle"><span class="studio-toggle__text"><b>Allowlist policy</b><p>Only approved addresses can hold token</p></span>
            <span class="studio-switch"><input type="checkbox" id="allowlist" /><span></span></span></label>
          <label class="studio-toggle"><span class="studio-toggle__text"><b>Blocklist policy</b><p>Bar specific addresses from transfers</p></span>
            <span class="studio-switch"><input type="checkbox" id="blocklist" /><span></span></span></label>
        </div>`,
        submit: () => {
          if ($("#grantMint")?.checked) state.roles.minter++;
          saveState();
          logActivity("roles", "Policy & roles updated");
          renderPreview();
          renderRoles();
          closeModal();
          toast("Roles updated");
        },
      },
    };

    const f = forms[action];
    if (!f) return;
    openModal(f.title, f.body, `<button type="button" class="btn btn--primary btn--block" id="modalSubmitBtn">Submit</button>`);
    $("#modalSubmitBtn").onclick = f.submit;
  }

  function showApproval(tool, summary) {
    const id = "req_" + Math.random().toString(36).slice(2, 10);
    openModal("Approve in Base Account", `
      <div class="approval-card">
        <span class="approval-card__tool">${tool}</span>
        <p class="approval-card__summary">${esc(summary)}</p>
        <p class="approval-card__id">Request <code>${id}</code></p>
        <a class="btn btn--primary btn--block" href="https://docs.base.org/agents/index" target="_blank" rel="noopener">Open approval flow →</a>
        <p class="modal-hint">Every MCP write opens Base Account for review. Poll <code>get_request_status(${id})</code> after approval.</p>
      </div>
    `, `<button type="button" class="btn btn--ghost btn--block" data-close-modal>Close</button>`);
    logActivity("approval", `${tool}: ${summary}`, "pending");
  }

  function openDeployModal() {
    openModal("Deploy B20 token", `
      <p class="modal-lead">Generated script for <code>base-forge</code> on ${NET[state.network].label}.</p>
      <pre class="studio-config-pre studio-config-pre--tall">${esc(b20DeployScript())}</pre>
      <p class="modal-hint">Factory addresses start with <code>0xB20f…</code> · tokens with <code>0xB200…</code>. Requires Beryl activation.</p>
    `, `<button type="button" class="btn btn--primary" id="copyDeployBtn">Copy script</button>
        <a class="btn btn--ghost" href="https://docs.base.org/get-started/launch-b20-token" target="_blank" rel="noopener">Full guide →</a>`);
    $("#copyDeployBtn").onclick = () => copyText(b20DeployScript(), "Deploy script copied");
  }

  function switchView(view) {
    $("#viewConnect").hidden = view !== "connect";
    $("#viewAgents").hidden = view !== "agents";
    $("#viewManage").hidden = view !== "manage";
    $$(".studio-nav__link[data-view]").forEach(l => l.classList.toggle("is-active", l.dataset.view === view));
  }

  document.addEventListener("input", (e) => {
    const t = e.target;
    if (t.id === "agentName") state.name = t.value.slice(0, 48) || "Agent";
    if (t.id === "agentHandle") state.handle = t.value.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24) || "agent";
    if (t.id === "tokenName") state.tokenName = t.value.slice(0, 48) || "Token";
    if (t.id === "tokenSymbol") state.tokenSymbol = t.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "TKN";
    if (t.id === "mcpEndpoint") state.endpoint = t.value.trim() || "https://mcp.base.org";
    if (t.id === "netSelect") state.network = t.value;
    if (t.id === "b20Aware") state.b20Aware = t.checked;
    if (t.id === "supplyCap") state.supplyCap = Math.max(0, parseInt(t.value, 10) || 0);
    if (t.id === "uncappedToggle") { state.uncapped = t.checked; $("#supplyCap").disabled = t.checked; }
    if (t.id === "decimalsRange") { state.decimals = parseInt(t.value, 10); $("#decimalsVal").textContent = t.value; }
    if (t.dataset.tool) state.tools[t.dataset.tool] = t.checked;
    saveState();
    syncForm();
  });

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-close-modal]")) { closeModal(); return; }

    if (e.target.closest("#walletBtn")) { openWalletModal(); return; }
    if (e.target.closest("#confirmWalletBtn")) {
      const w = ($("#walletInput")?.value || "").trim();
      if (!/^0x[a-fA-F0-9]{40}$/.test(w)) { toast("Enter a valid 0x address"); return; }
      state.wallet = w;
      saveState();
      logActivity("wallet", shortAddr(w) + " linked");
      renderPreview();
      closeModal();
      toast("Wallet linked");
      return;
    }

    if (e.target.closest("#connectAgentBtn")) { registerAgent(); return; }
    if (e.target.closest("#copyConfigBtn") || e.target.closest("#copyConfigPreview")) {
      copyText(JSON.stringify(mcpConfig(), null, 2), "MCP config copied"); return;
    }
    if (e.target.closest("#copyCursorBtn")) { copyText(cursorConfig(), "Cursor config copied"); return; }
    if (e.target.closest("#copyAddrBtn")) { copyText(tokenAddress(), "Token address copied"); return; }
    if (e.target.closest("#deployB20Btn")) { openDeployModal(); return; }
    if (e.target.closest("#clearActivity")) { state.activity = []; saveState(); renderActivity(); return; }

    const actionBtn = e.target.closest("[data-action]");
    if (actionBtn) { openActionModal(actionBtn.dataset.action); return; }

    const variant = e.target.closest("[data-variant]");
    if (variant) {
      state.variant = variant.dataset.variant;
      if (state.variant === "stable") state.decimals = 6;
      saveState();
      syncForm();
      return;
    }

    const nav = e.target.closest(".studio-nav__link[data-view]");
    if (nav) { switchView(nav.dataset.view); return; }
  });

  if (state.connected) $("#connectAgentBtn").textContent = "Connected ✓";
  syncForm();
})();
