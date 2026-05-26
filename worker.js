/**
 * VibeCodersAI - Cloudflare Worker Backend Proxy
 * ------------------------------------------------
 * POST /api/chat
 *
 * Tries AI providers in this priority order, falling back automatically:
 *   1. OpenRouter   (needs OPENROUTER_API_KEY)
 *   2. Groq         (needs GROQ_API_KEY)
 *   3. Gemini       (needs GEMINI_API_KEY)
 *   4. Pollinations (no key required - always available fallback)
 *
 * API keys are read ONLY from Cloudflare Worker secrets / environment vars.
 * Never expose them to the frontend.
 *
 * Set secrets with:
 *   wrangler secret put OPENROUTER_API_KEY
 *   wrangler secret put GROQ_API_KEY
 *   wrangler secret put GEMINI_API_KEY
 */

const ALLOWED_ORIGINS = "*"; // tighten this in production if you want
const MAX_MESSAGE_LEN = 8000;
const MAX_HISTORY = 20;
const PROVIDER_TIMEOUT_MS = 25000;

// ---- Simple in-memory rate limit (per worker isolate) ---------------------
// Not perfect across edge regions, but a cheap abuse guard.
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const RATE_LIMIT_MAX = 30;           // 30 requests / minute / IP
const ipHits = new Map();

function rateLimited(ip) {
  if (!ip) return false;
  const now = Date.now();
  const rec = ipHits.get(ip) || { count: 0, start: now };
  if (now - rec.start > RATE_LIMIT_WINDOW_MS) {
    rec.count = 0;
    rec.start = now;
  }
  rec.count++;
  ipHits.set(ip, rec);
  return rec.count > RATE_LIMIT_MAX;
}

// ---- CORS ------------------------------------------------------------------
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(),
    },
  });
}

// ---- Mode -> system prompt -------------------------------------------------
const MODE_PROMPTS = {
  chat:
    "You are VibeCodersAI, a premium, friendly, concise general assistant. " +
    "Answer clearly. Use Markdown when helpful.",
  coding:
    "You are VibeCodersAI Coding Assistant. You explain, generate, debug and " +
    "fix HTML, CSS, JavaScript, Python, Node, React, PHP, XML, YAML, JSON and " +
    "Markdown. Always give complete, copy-paste-ready code in fenced blocks " +
    "with the correct language tag. Prefer modern, clean, secure patterns.",
  tagalog:
    "Ikaw ay VibeCodersAI, isang magalang at matalinong AI katulong. Sumagot " +
    "ka nang natural sa Tagalog o Taglish kapag Tagalog ang user. Linaw, " +
    "bait, at tama lagi.",
  creative:
    "You are VibeCodersAI Creative Writer. Produce vivid scripts, stories, " +
    "captions, reels ideas, and voiceover scripts. Be original, emotionally " +
    "engaging, and structured.",
  prompt:
    "You are VibeCodersAI Prompt Engineer. Improve user prompts and craft " +
    "high-quality prompts for AI image generators, video generators, and app " +
    "builders. Output only the final improved prompt unless explanation is " +
    "explicitly requested.",
  business:
    "You are VibeCodersAI Business Helper. Write polished bios, product " +
    "descriptions, marketing copy, and Facebook page content. Keep tone " +
    "professional, persuasive, and on-brand.",
  builder:
    "You are VibeCodersAI Web App Builder Helper. Help users build full apps " +
    "in HTML, CSS, JS, React, Node, Python, PHP, XML, YAML, JSON, Markdown. " +
    "Give complete copy-paste code with file names. Explain deployment to " +
    "Render, Netlify, Vercel, GitHub Pages, and Cloudflare Workers.",
};

function systemPromptFor(mode) {
  return MODE_PROMPTS[mode] || MODE_PROMPTS.chat;
}

// ---- Provider routing ------------------------------------------------------
// Pick a preferred starting provider based on the model name the user chose.
// We then still fall back through the rest of the chain if it fails.
function preferredProviderFor(model) {
  if (!model) return "openrouter";
  const m = String(model).toLowerCase();
  if (m === "pollinations") return "pollinations";
  if (m.startsWith("gemini")) return "gemini";
  if (m.startsWith("llama-3") || m.includes("groq")) return "groq";
  // openrouter models are typically "vendor/name"
  if (m.includes("/")) return "openrouter";
  return "openrouter";
}

// Order of fallback providers, starting with the preferred one.
function providerChain(preferred) {
  const all = ["openrouter", "groq", "gemini", "pollinations"];
  const ordered = [preferred, ...all.filter((p) => p !== preferred)];
  return ordered;
}

// ---- fetch with timeout ----------------------------------------------------
async function fetchWithTimeout(url, opts = {}, ms = PROVIDER_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ---- Build OpenAI-style messages from history + system + user --------------
function buildOpenAIMessages(systemPrompt, history, message) {
  const msgs = [{ role: "system", content: systemPrompt }];
  if (Array.isArray(history)) {
    for (const h of history.slice(-MAX_HISTORY)) {
      if (!h || typeof h.content !== "string") continue;
      const role = h.role === "assistant" ? "assistant" : "user";
      msgs.push({ role, content: h.content.slice(0, MAX_MESSAGE_LEN) });
    }
  }
  msgs.push({ role: "user", content: message });
  return msgs;
}

// ---- Provider: OpenRouter --------------------------------------------------
async function callOpenRouter(env, { message, model, systemPrompt, history }) {
  if (!env.OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY missing");
  const chosenModel =
    model && model.includes("/") ? model : "openrouter/auto";

  const res = await fetchWithTimeout(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://vibecodersai.app",
        "X-Title": "VibeCodersAI",
      },
      body: JSON.stringify({
        model: chosenModel,
        messages: buildOpenAIMessages(systemPrompt, history, message),
        temperature: 0.7,
      }),
    }
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("OpenRouter: empty reply");
  return reply.trim();
}

// ---- Provider: Groq --------------------------------------------------------
async function callGroq(env, { message, model, systemPrompt, history }) {
  if (!env.GROQ_API_KEY) throw new Error("GROQ_API_KEY missing");
  const groqModels = new Set([
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile",
  ]);
  const chosenModel = groqModels.has(model) ? model : "llama-3.1-8b-instant";

  const res = await fetchWithTimeout(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: chosenModel,
        messages: buildOpenAIMessages(systemPrompt, history, message),
        temperature: 0.7,
      }),
    }
  );

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Groq ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const reply = data?.choices?.[0]?.message?.content;
  if (!reply) throw new Error("Groq: empty reply");
  return reply.trim();
}

// ---- Provider: Gemini ------------------------------------------------------
async function callGemini(env, { message, model, systemPrompt, history }) {
  if (!env.GEMINI_API_KEY) throw new Error("GEMINI_API_KEY missing");
  const geminiModels = new Set(["gemini-1.5-flash", "gemini-1.5-pro"]);
  const chosenModel = geminiModels.has(model) ? model : "gemini-1.5-flash";

  const contents = [];
  if (Array.isArray(history)) {
    for (const h of history.slice(-MAX_HISTORY)) {
      if (!h || typeof h.content !== "string") continue;
      contents.push({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content.slice(0, MAX_MESSAGE_LEN) }],
      });
    }
  }
  contents.push({ role: "user", parts: [{ text: message }] });

  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${chosenModel}` +
    `:generateContent?key=${encodeURIComponent(env.GEMINI_API_KEY)}`;

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
      generationConfig: { temperature: 0.7 },
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Gemini ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  const reply = data?.candidates?.[0]?.content?.parts
    ?.map((p) => p?.text || "")
    .join("")
    .trim();
  if (!reply) throw new Error("Gemini: empty reply");
  return reply;
}

// ---- Provider: Pollinations (no key required) -----------------------------
// We prefer the simple GET endpoint with encoded prompt — it returns clean
// plain-text responses for anonymous users. If that fails, we try the
// OpenAI-compatible POST endpoint as a backup.
async function callPollinations(_env, { message, systemPrompt, history }) {
  // Build a single prompt from system + last few turns + user message.
  const ctxLines = [systemPrompt, ""];
  if (Array.isArray(history)) {
    for (const h of history.slice(-MAX_HISTORY)) {
      if (!h || typeof h.content !== "string") continue;
      const who = h.role === "assistant" ? "Assistant" : "User";
      ctxLines.push(`${who}: ${h.content.slice(0, MAX_MESSAGE_LEN)}`);
    }
  }
  ctxLines.push(`User: ${message}`);
  ctxLines.push("Assistant:");
  const prompt = ctxLines.join("\n");

  // 1. GET endpoint — most reliable for anonymous use.
  const getUrl =
    "https://text.pollinations.ai/" +
    encodeURIComponent(prompt) +
    "?model=openai";
  try {
    const res = await fetchWithTimeout(getUrl, { method: "GET" });
    if (res.ok) {
      const txt = await res.text();
      if (txt && txt.trim()) return txt.trim();
    }
  } catch (_) { /* fall through */ }

  // 2. POST endpoint as backup.
  const messages = buildOpenAIMessages(systemPrompt, history, message);
  const res2 = await fetchWithTimeout(
    "https://text.pollinations.ai/openai",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai", messages, temperature: 0.7 }),
    }
  );
  if (!res2.ok) {
    throw new Error(`Pollinations ${res2.status}`);
  }
  const ct = res2.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const data = await res2.json();
    const reply =
      data?.choices?.[0]?.message?.content ||
      data?.choices?.[0]?.text ||
      "";
    if (reply) return reply.trim();
  } else {
    const txt = await res2.text();
    if (txt && txt.trim()) return txt.trim();
  }
  throw new Error("Pollinations: empty reply");
}

// ---- Dispatcher ------------------------------------------------------------
async function callProvider(name, env, payload) {
  switch (name) {
    case "openrouter": return callOpenRouter(env, payload);
    case "groq":       return callGroq(env, payload);
    case "gemini":     return callGemini(env, payload);
    case "pollinations": return callPollinations(env, payload);
    default: throw new Error(`Unknown provider: ${name}`);
  }
}

function isProviderConfigured(name, env) {
  if (name === "pollinations") return true;
  if (name === "openrouter") return Boolean(env.OPENROUTER_API_KEY);
  if (name === "groq")       return Boolean(env.GROQ_API_KEY);
  if (name === "gemini")     return Boolean(env.GEMINI_API_KEY);
  return false;
}

// ---- Input validation ------------------------------------------------------
function validateInput(body) {
  if (!body || typeof body !== "object") return "Invalid request body.";
  if (typeof body.message !== "string") return "Message is required.";
  const trimmed = body.message.trim();
  if (!trimmed) return "Message cannot be empty.";
  if (trimmed.length > MAX_MESSAGE_LEN)
    return `Message too long (max ${MAX_MESSAGE_LEN} chars).`;
  return null;
}

// ---- Main handler ----------------------------------------------------------
async function handleChat(request, env) {
  // Rate limit by IP
  const ip =
    request.headers.get("CF-Connecting-IP") ||
    request.headers.get("x-forwarded-for") ||
    "unknown";
  if (rateLimited(ip)) {
    return jsonResponse(
      {
        success: false,
        error:
          "You're sending messages too quickly. Please wait a moment and try again.",
      },
      429
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse(
      { success: false, error: "Invalid JSON body." },
      400
    );
  }

  const validationErr = validateInput(body);
  if (validationErr) {
    return jsonResponse({ success: false, error: validationErr }, 400);
  }

  const message = body.message.trim();
  const model = typeof body.model === "string" ? body.model : "";
  const mode = typeof body.mode === "string" ? body.mode : "chat";
  const history = Array.isArray(body.history) ? body.history : [];
  const systemPrompt = systemPromptFor(mode);

  const preferred = preferredProviderFor(model);
  const chain = providerChain(preferred);

  const errors = [];
  for (const name of chain) {
    if (!isProviderConfigured(name, env)) {
      errors.push(`${name}: not configured`);
      continue;
    }
    try {
      const reply = await callProvider(name, env, {
        message,
        model,
        systemPrompt,
        history,
      });
      if (reply && reply.trim()) {
        return jsonResponse({ success: true, reply, provider: name });
      }
      errors.push(`${name}: empty reply`);
    } catch (err) {
      // Log to worker logs (does not expose to user)
      console.warn(`[VibeCodersAI] ${name} failed:`, err?.message || err);
      errors.push(`${name}: ${err?.message || "error"}`);
    }
  }

  // All providers failed
  console.warn("[VibeCodersAI] all providers failed:", errors.join(" | "));
  return jsonResponse(
    {
      success: false,
      error:
        "Sorry, the AI service is temporarily unavailable. Please try again.",
    },
    503
  );
}

// ---- Worker entry ----------------------------------------------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Health check
    if (request.method === "GET" && url.pathname === "/") {
      return new Response("VibeCodersAI backend is running.", {
        status: 200,
        headers: { "Content-Type": "text/plain", ...corsHeaders() },
      });
    }

    if (request.method === "POST" && url.pathname === "/api/chat") {
      return handleChat(request, env);
    }

    return jsonResponse({ success: false, error: "Not found." }, 404);
  },
};
