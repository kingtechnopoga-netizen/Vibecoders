/* =========================================================
   VibeCodersAI — Frontend logic
   No API keys here. All premium AI calls go through the
   Cloudflare Worker proxy at BACKEND_URL.

   If no backend is configured (or it fails), we fall back to
   Pollinations AI directly from the browser — Pollinations is
   designed to be called publicly with no API key.
   ========================================================= */

// ============================================================
//  Backend URL resolution
// ============================================================
// 1. Runtime override:   <script>window.VIBECODERSAI_BACKEND_URL = "..."</script>
// 2. Direct Worker URL:  edit DIRECT_WORKER_URL below.
// 3. Same-origin proxy:  /api/chat (e.g. via netlify.toml / vercel.json).
// 4. None of the above:  the app still works using the public Pollinations
//                        fallback (no premium providers, no rate-limit guard,
//                        but it's a real AI response — not a demo).
//
// Premium API keys (OpenRouter / Groq / Gemini) NEVER live here.
const DIRECT_WORKER_URL =
  "https://your-worker-name.your-subdomain.workers.dev/api/chat";

const BACKEND_URL = (function resolveBackendUrl() {
  if (typeof window !== "undefined" && typeof window.VIBECODERSAI_BACKEND_URL === "string" && window.VIBECODERSAI_BACKEND_URL) {
    return window.VIBECODERSAI_BACKEND_URL;
  }
  if (!DIRECT_WORKER_URL.includes("your-worker-name")) {
    return DIRECT_WORKER_URL;
  }
  // Same-origin /api/chat — works automatically when a host (Netlify/Vercel)
  // proxies it to your Worker, or when you serve the worker on your domain.
  return "/api/chat";
})();

// True only when the page-author hasn't set up a real backend yet.
const BACKEND_CONFIGURED = !BACKEND_URL.includes("your-worker-name");

// ----- Storage keys -----
const LS = {
  history:  "vibecodersai:history",
  model:    "vibecodersai:model",
  mode:     "vibecodersai:mode",
  theme:    "vibecodersai:theme",
};

// ----- Mode display labels -----
const MODE_LABELS = {
  chat:     "Normal Chat",
  coding:   "Coding Assistant",
  tagalog:  "Tagalog Assistant",
  creative: "Creative Writer",
  prompt:   "Prompt Engineer",
  business: "Business Helper",
  builder:  "Web App Builder",
};

// ----- App state -----
const state = {
  history:  loadJSON(LS.history, []),     // [{role:'user'|'assistant', content:''}]
  model:    localStorage.getItem(LS.model) || "openrouter/auto",
  mode:     localStorage.getItem(LS.mode)  || "chat",
  theme:    localStorage.getItem(LS.theme) || "dark",
  pending:  false,
  abortCtrl: null,
};

// ----- DOM refs -----
const $ = (sel) => document.querySelector(sel);
const chatEl       = $("#chat");
const welcomeEl    = $("#welcome");
const loadingEl    = $("#loading");
const errorBar     = $("#errorBar");
const errorText    = $("#errorText");
const retryBtn     = $("#retryBtn");
const inputEl      = $("#input");
const sendBtn      = $("#sendBtn");
const stopBtn      = $("#stopBtn");
const counterEl    = $("#counter");
const metaMode     = $("#metaMode");
const metaModel    = $("#metaModel");
const providerBadge = $("#providerBadge");

const settingsBtn  = $("#settingsBtn");
const closeSettings = $("#closeSettings");
const settingsPanel = $("#settingsPanel");
const panelBackdrop = $("#panelBackdrop");

const modeSelect   = $("#modeSelect");
const modelSelect  = $("#modelSelect");

const themeBtn     = $("#themeBtn");
const themeDarkBtn = $("#themeDark");
const themeLightBtn = $("#themeLight");
const newChatBtn   = $("#newChatBtn");
const exportBtn    = $("#exportBtn");
const clearBtn     = $("#clearBtn");
const resetBtn     = $("#resetBtn");
const main         = document.querySelector(".main");

// =========================================================
//  INIT
// =========================================================
function init() {
  applyTheme(state.theme);
  modeSelect.value = state.mode;
  modelSelect.value = pickValidOption(modelSelect, state.model) || "openrouter/auto";
  state.model = modelSelect.value;
  metaMode.textContent  = MODE_LABELS[state.mode] || "Normal Chat";
  metaModel.textContent = state.model;

  renderHistory();
  toggleWelcome(state.history.length === 0);
  updateCounter();
  bindEvents();
  autoResize();

  // If no premium backend is configured, set the badge so the user knows
  // we're in direct-fallback mode (still real AI, just no premium models).
  if (!BACKEND_CONFIGURED) {
    providerBadge.textContent = "free mode";
    providerBadge.title =
      "No backend configured — using free Pollinations AI directly. " +
      "Deploy worker.js to Cloudflare and add API keys to enable premium models.";
  }
}

function pickValidOption(selectEl, value) {
  const opts = Array.from(selectEl.querySelectorAll("option"));
  return opts.find((o) => o.value === value)?.value || null;
}

// =========================================================
//  EVENTS
// =========================================================
function bindEvents() {
  sendBtn.addEventListener("click", onSend);
  stopBtn.addEventListener("click", onStop);
  retryBtn.addEventListener("click", onRetry);

  inputEl.addEventListener("input", () => {
    updateCounter();
    autoResize();
  });
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  });

  document.querySelectorAll(".chip").forEach((btn) => {
    btn.addEventListener("click", () => {
      inputEl.value = btn.dataset.prompt || btn.textContent;
      autoResize();
      updateCounter();
      inputEl.focus();
    });
  });

  // Settings panel
  settingsBtn.addEventListener("click", () => openPanel(true));
  closeSettings.addEventListener("click", () => openPanel(false));
  panelBackdrop.addEventListener("click", () => openPanel(false));

  modeSelect.addEventListener("change", () => {
    state.mode = modeSelect.value;
    localStorage.setItem(LS.mode, state.mode);
    metaMode.textContent = MODE_LABELS[state.mode] || "Normal Chat";
  });
  modelSelect.addEventListener("change", () => {
    state.model = modelSelect.value;
    localStorage.setItem(LS.model, state.model);
    metaModel.textContent = state.model;
  });

  // Theme
  themeBtn.addEventListener("click", () => {
    applyTheme(state.theme === "dark" ? "light" : "dark");
  });
  themeDarkBtn.addEventListener("click", () => applyTheme("dark"));
  themeLightBtn.addEventListener("click", () => applyTheme("light"));

  // Chat data buttons
  newChatBtn.addEventListener("click", newChat);
  clearBtn.addEventListener("click", () => {
    if (confirm("Clear all chat messages on this device?")) newChat();
  });
  exportBtn.addEventListener("click", exportChat);
  resetBtn.addEventListener("click", () => {
    if (!confirm("Reset all settings (theme, model, mode)? Chat is kept.")) return;
    localStorage.removeItem(LS.model);
    localStorage.removeItem(LS.mode);
    localStorage.removeItem(LS.theme);
    state.model = "openrouter/auto";
    state.mode  = "chat";
    applyTheme("dark");
    modelSelect.value = state.model;
    modeSelect.value  = state.mode;
    metaModel.textContent = state.model;
    metaMode.textContent  = MODE_LABELS[state.mode];
  });

  // Mobile keyboard / viewport changes
  window.addEventListener("resize", () => {
    requestAnimationFrame(scrollToBottom);
  });
}

function openPanel(show) {
  settingsPanel.setAttribute("aria-hidden", show ? "false" : "true");
}

// =========================================================
//  THEME
// =========================================================
function applyTheme(t) {
  state.theme = t === "light" ? "light" : "dark";
  document.body.dataset.theme = state.theme;
  localStorage.setItem(LS.theme, state.theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", state.theme === "light" ? "#fbe5e9" : "#0a0508");
}

// =========================================================
//  COMPOSER UTILS
// =========================================================
function autoResize() {
  inputEl.style.height = "auto";
  inputEl.style.height = Math.min(inputEl.scrollHeight, 160) + "px";
}
function updateCounter() {
  const len = inputEl.value.length;
  counterEl.textContent = `${len} / 8000`;
}
function toggleWelcome(show) {
  welcomeEl.classList.toggle("hidden", !show);
}

// =========================================================
//  RENDERING
// =========================================================
function renderHistory() {
  chatEl.innerHTML = "";
  for (const msg of state.history) {
    appendMessage(msg.role, msg.content, { animate: false, save: false, meta: msg.provider });
  }
  scrollToBottom();
}

/**
 * Append a message safely. We use textContent for user input and
 * a small Markdown-ish formatter for AI output that ONLY produces
 * specific allowed elements (p, br, strong, em, code, pre, ul, li).
 */
function appendMessage(role, content, opts = {}) {
  const { animate = true, save = true, meta = null } = opts;

  toggleWelcome(false);

  const wrap = document.createElement("div");
  wrap.className = `msg ${role === "assistant" ? "ai" : "user"}`;
  if (!animate) wrap.style.animation = "none";

  const bubble = document.createElement("div");
  bubble.className = "bubble";

  if (role === "user") {
    // Plain text only - no HTML injection possible.
    bubble.textContent = content;
  } else {
    bubble.appendChild(renderMarkdown(content));
  }
  wrap.appendChild(bubble);

  // Action row (AI messages only, except meta for both)
  if (role === "assistant") {
    const actions = document.createElement("div");
    actions.className = "msg-actions";

    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => {
      copyToClipboard(content).then(() => {
        copyBtn.textContent = "Copied";
        setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
      });
    });
    actions.appendChild(copyBtn);

    const regenBtn = document.createElement("button");
    regenBtn.type = "button";
    regenBtn.textContent = "Regenerate";
    regenBtn.addEventListener("click", () => regenerateLast());
    actions.appendChild(regenBtn);

    if (meta) {
      const m = document.createElement("span");
      m.className = "msg-meta";
      m.textContent = `· ${meta}`;
      actions.appendChild(m);
    }
    bubble.appendChild(actions);
  }

  chatEl.appendChild(wrap);

  if (save) {
    const entry = { role, content };
    if (meta) entry.provider = meta;
    state.history.push(entry);
    saveHistory();
  }

  scrollToBottom();
}

/**
 * Lightweight, safe Markdown -> DOM converter.
 * Supports: ```code blocks```, `inline code`, **bold**, *italic*,
 * line breaks, paragraphs, simple - lists.
 * Everything else becomes plain text. No raw HTML allowed.
 */
function renderMarkdown(src) {
  const root = document.createDocumentFragment();
  const parts = String(src).split(/```/);

  for (let i = 0; i < parts.length; i++) {
    const chunk = parts[i];
    if (i % 2 === 1) {
      // Code block. First line may be a language hint.
      const firstNl = chunk.indexOf("\n");
      let code = chunk;
      if (firstNl !== -1) {
        const maybeLang = chunk.slice(0, firstNl).trim();
        if (/^[a-zA-Z0-9_+\-]{0,20}$/.test(maybeLang)) {
          code = chunk.slice(firstNl + 1);
        }
      }
      const pre = document.createElement("pre");
      const codeEl = document.createElement("code");
      codeEl.textContent = code.replace(/\s+$/, "");
      pre.appendChild(codeEl);
      root.appendChild(pre);
    } else {
      renderInlineBlock(chunk, root);
    }
  }
  return root;
}

function renderInlineBlock(text, parent) {
  // Split into paragraphs by blank lines
  const paragraphs = text.split(/\n{2,}/);
  for (const p of paragraphs) {
    if (!p.trim()) continue;

    // List detection (lines starting with - or *)
    const lines = p.split("\n");
    const isList = lines.every((l) => /^\s*[-*]\s+/.test(l) || !l.trim());
    if (isList && lines.some((l) => l.trim())) {
      const ul = document.createElement("ul");
      ul.style.margin = "6px 0 6px 18px";
      ul.style.padding = "0";
      for (const l of lines) {
        if (!l.trim()) continue;
        const li = document.createElement("li");
        renderInline(l.replace(/^\s*[-*]\s+/, ""), li);
        ul.appendChild(li);
      }
      parent.appendChild(ul);
      continue;
    }

    const para = document.createElement("p");
    para.style.margin = "4px 0";
    // Treat single newlines inside paragraph as <br>.
    const sublines = p.split("\n");
    sublines.forEach((line, idx) => {
      renderInline(line, para);
      if (idx < sublines.length - 1) para.appendChild(document.createElement("br"));
    });
    parent.appendChild(para);
  }
}

function renderInline(line, parent) {
  // Handle inline code, bold, italic. Everything else is text.
  // Pattern order: `code`, **bold**, *italic*
  const re = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)/g;
  let lastIdx = 0;
  let m;
  while ((m = re.exec(line)) !== null) {
    if (m.index > lastIdx) {
      parent.appendChild(document.createTextNode(line.slice(lastIdx, m.index)));
    }
    if (m[1]) {
      const c = document.createElement("code");
      c.textContent = m[1].slice(1, -1);
      parent.appendChild(c);
    } else if (m[2]) {
      const b = document.createElement("strong");
      b.textContent = m[2].slice(2, -2);
      parent.appendChild(b);
    } else if (m[3]) {
      const i = document.createElement("em");
      i.textContent = m[3].slice(1, -1);
      parent.appendChild(i);
    }
    lastIdx = re.lastIndex;
  }
  if (lastIdx < line.length) {
    parent.appendChild(document.createTextNode(line.slice(lastIdx)));
  }
}

function scrollToBottom() {
  // Use the scrollable main container
  main.scrollTop = main.scrollHeight;
}

// =========================================================
//  CHAT FLOW
// =========================================================
async function onSend() {
  if (state.pending) return;
  const text = inputEl.value.trim();
  if (!text) return;

  hideError();
  appendMessage("user", text);
  inputEl.value = "";
  autoResize();
  updateCounter();

  await sendToBackend(text);
}

async function onRetry() {
  hideError();
  // Resend the last user message that didn't get an assistant reply.
  const lastUser = [...state.history].reverse().find((m) => m.role === "user");
  if (!lastUser) return;
  await sendToBackend(lastUser.content, { resend: true });
}

async function regenerateLast() {
  if (state.pending) return;
  // Find last user message; remove any assistant message after it; resend.
  const idx = [...state.history].map((m) => m.role).lastIndexOf("user");
  if (idx === -1) return;
  // Drop everything after the last user message
  state.history = state.history.slice(0, idx + 1);
  saveHistory();
  renderHistory();
  await sendToBackend(state.history[idx].content, { resend: true });
}

// =========================================================
//  System prompts (mirrors worker MODE_PROMPTS) — used by the
//  client-side Pollinations fallback when no backend is set.
// =========================================================
const CLIENT_MODE_PROMPTS = {
  chat:
    "You are VibeCodersAI, a premium, friendly, concise general assistant. " +
    "Answer clearly. Use Markdown when helpful.",
  coding:
    "You are VibeCodersAI Coding Assistant. Explain, generate, debug, and " +
    "fix HTML, CSS, JavaScript, Python, Node, React, PHP, XML, YAML, JSON, " +
    "and Markdown. Always give complete, copy-paste-ready code in fenced " +
    "blocks with the correct language tag.",
  tagalog:
    "Ikaw ay VibeCodersAI. Sumagot ka nang natural sa Tagalog o Taglish " +
    "kapag Tagalog ang user. Linaw, bait, at tama lagi.",
  creative:
    "You are VibeCodersAI Creative Writer. Produce vivid scripts, stories, " +
    "captions, reels ideas, and voiceover scripts. Be original and engaging.",
  prompt:
    "You are VibeCodersAI Prompt Engineer. Improve user prompts and craft " +
    "high-quality prompts for AI image, video, and app builders.",
  business:
    "You are VibeCodersAI Business Helper. Write polished bios, product " +
    "descriptions, marketing copy, and Facebook page content.",
  builder:
    "You are VibeCodersAI Web App Builder Helper. Help build full apps in " +
    "HTML, CSS, JS, React, Node, Python, PHP. Give complete copy-paste code.",
};

// Client-side Pollinations call (no API key needed). Used when:
//  - the page author hasn't deployed a backend yet, OR
//  - the configured backend errored out for this request.
async function callPollinationsDirect({ message, mode, history, signal }) {
  const sys = CLIENT_MODE_PROMPTS[mode] || CLIENT_MODE_PROMPTS.chat;
  const lines = [sys, ""];
  if (Array.isArray(history)) {
    for (const h of history.slice(-12)) {
      if (!h || typeof h.content !== "string") continue;
      const who = h.role === "assistant" ? "Assistant" : "User";
      lines.push(`${who}: ${h.content.slice(0, 4000)}`);
    }
  }
  lines.push(`User: ${message}`);
  lines.push("Assistant:");
  const prompt = lines.join("\n");

  // Pollinations GET endpoint: returns plain text, anonymous-friendly,
  // CORS-open. No API key. https://pollinations.ai
  const url =
    "https://text.pollinations.ai/" +
    encodeURIComponent(prompt) +
    "?model=openai";

  const res = await fetch(url, { method: "GET", signal });
  if (!res.ok) {
    throw new Error(`Pollinations ${res.status}`);
  }
  const txt = await res.text();
  if (!txt || !txt.trim()) {
    throw new Error("Empty reply from fallback service.");
  }
  return txt.trim();
}

async function sendToBackend(message, opts = {}) {
  setPending(true);
  showLoading(true);

  // History to send: everything BEFORE the most recent user message,
  // so the backend sees the conversation context.
  const histForBackend = [];
  let foundLastUser = false;
  for (let i = state.history.length - 1; i >= 0; i--) {
    const m = state.history[i];
    if (!foundLastUser && m.role === "user") { foundLastUser = true; continue; }
    histForBackend.unshift({ role: m.role, content: m.content });
  }

  state.abortCtrl = new AbortController();

  // ---- Path 1: real backend is configured. Try it first. ----
  if (BACKEND_CONFIGURED) {
    try {
      const res = await fetch(BACKEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          model: state.model,
          mode: state.mode,
          history: histForBackend,
        }),
        signal: state.abortCtrl.signal,
      });

      let data;
      try { data = await res.json(); }
      catch { throw new Error("Unexpected response from server."); }

      if (data && data.success === true && typeof data.reply === "string") {
        appendMessage("assistant", data.reply, { meta: data.provider || null });
        if (data.provider) {
          providerBadge.textContent = data.provider;
          providerBadge.title = `Last provider: ${data.provider}`;
        }
        state.abortCtrl = null;
        setPending(false);
        showLoading(false);
        return;
      }
      // Backend responded but failed — fall through to client fallback.
    } catch (err) {
      if (err && err.name === "AbortError") {
        hideError();
        state.abortCtrl = null;
        setPending(false);
        showLoading(false);
        return;
      }
      // Network error — fall through to client fallback.
    }
  }

  // ---- Path 2: client-side Pollinations fallback. ----
  // Used when no backend is configured, or when the backend failed.
  try {
    const reply = await callPollinationsDirect({
      message,
      mode: state.mode,
      history: histForBackend,
      signal: state.abortCtrl.signal,
    });
    appendMessage("assistant", reply, { meta: "pollinations (direct)" });
    providerBadge.textContent = "pollinations";
    providerBadge.title = BACKEND_CONFIGURED
      ? "Backend was unreachable; used direct fallback."
      : "Direct fallback (deploy the worker for premium providers).";
  } catch (err) {
    if (err && err.name === "AbortError") {
      hideError();
    } else {
      showError(friendlyError(err));
    }
  } finally {
    state.abortCtrl = null;
    setPending(false);
    showLoading(false);
  }
}

function friendlyError(err) {
  const raw = (err && err.message) || "";
  if (raw.toLowerCase().includes("failed to fetch") ||
      raw.toLowerCase().includes("networkerror")) {
    return "Network error. Please check your connection and try again.";
  }
  return "Sorry, something went wrong. Please try again.";
}

function onStop() {
  if (state.abortCtrl) state.abortCtrl.abort();
}

function setPending(v) {
  state.pending = v;
  sendBtn.disabled = v;
  stopBtn.hidden = !v;
  sendBtn.hidden = v;
  inputEl.disabled = false; // keep typing enabled
}
function showLoading(v) {
  loadingEl.hidden = !v;
  if (v) scrollToBottom();
}
function showError(msg) {
  errorText.textContent = msg;
  errorBar.hidden = false;
  scrollToBottom();
}
function hideError() {
  errorBar.hidden = true;
}

// =========================================================
//  HISTORY / EXPORT / NEW CHAT
// =========================================================
function saveHistory() {
  try {
    // Cap stored history to last 200 messages to keep storage small
    const trimmed = state.history.slice(-200);
    localStorage.setItem(LS.history, JSON.stringify(trimmed));
    state.history = trimmed;
  } catch {
    // Quota exceeded — drop oldest half and retry once
    state.history = state.history.slice(-100);
    try { localStorage.setItem(LS.history, JSON.stringify(state.history)); } catch {}
  }
}

function newChat() {
  state.history = [];
  saveHistory();
  chatEl.innerHTML = "";
  toggleWelcome(true);
  hideError();
  providerBadge.textContent = "idle";
  providerBadge.title = "";
  inputEl.focus();
}

function exportChat() {
  if (state.history.length === 0) {
    alert("Nothing to export yet.");
    return;
  }
  const lines = ["VibeCodersAI — Chat Export", `Exported: ${new Date().toISOString()}`, ""];
  for (const m of state.history) {
    const who = m.role === "assistant" ? "VibeCodersAI" : "You";
    lines.push(`### ${who}`);
    lines.push(m.content);
    lines.push("");
  }
  const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `vibecodersai-chat-${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// =========================================================
//  HELPERS
// =========================================================
function loadJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const v = JSON.parse(raw);
    return Array.isArray(v) || (v && typeof v === "object") ? v : fallback;
  } catch {
    return fallback;
  }
}

async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {}
  // Fallback
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } catch {}
  document.body.removeChild(ta);
  return true;
}

// =========================================================
//  GO
// =========================================================
init();
