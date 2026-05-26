# VibeCodersAI

**VibeCodersAI** is a premium AI coding and creative assistant — a fully working
chatbot web app with a static frontend and a Cloudflare Worker backend proxy.
It supports multiple AI providers with automatic fallback so the chatbot keeps
working even if one provider is down or unconfigured.

- **Frontend:** HTML + CSS + Vanilla JavaScript (no frameworks)
- **Backend:** Cloudflare Worker (`worker.js`) — free tier
- **Providers (priority order):**
  1. OpenRouter
  2. Groq
  3. Gemini
  4. Pollinations AI (no key — always-on fallback)

API keys live **only** in Cloudflare Worker secrets. They are never exposed to
the browser.

---

## ⚡ One-click deploy

| Backend (Cloudflare Worker) | Frontend (static site) |
|---|---|
| [![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kingtechnopoga-netizen/Vibecoders) | [![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/kingtechnopoga-netizen/Vibecoders) |
|  | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/kingtechnopoga-netizen/Vibecoders) |
|  | [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/kingtechnopoga-netizen/Vibecoders) |

After clicking the buttons, you still need to do **two** things only you can do:

1. Add your AI provider keys as Cloudflare Worker secrets (see §2.3 below).
2. Point the frontend at your Worker URL — choose **one**:
   - **Easiest:** edit `netlify.toml` / `vercel.json` and replace
     `https://vibecodersai.YOUR-SUBDOMAIN.workers.dev/api/chat` with your real
     Worker URL. The frontend already calls `/api/chat` and will be proxied.
   - **Manual:** edit `DIRECT_WORKER_URL` in `script.js`.
   - **Runtime:** add `<script>window.VIBECODERSAI_BACKEND_URL="https://..."</script>` before `script.js`.

---

## 1. File overview

```
.
├── index.html      # Static frontend
├── style.css       # Premium red crystal UI
├── script.js       # Frontend logic (calls the Worker, no API keys here)
├── worker.js       # Cloudflare Worker backend proxy
├── wrangler.toml   # Cloudflare Worker config (one-command deploy)
├── netlify.toml    # Optional same-origin /api/chat rewrite for Netlify
├── vercel.json     # Optional same-origin /api/chat rewrite for Vercel
└── README.md       # This file
```

---

## 2. Deploy the backend (Cloudflare Worker)

You need a free Cloudflare account.

### 2.1 One-time deploy with Wrangler CLI (recommended)

`wrangler.toml` is already included, so this is two commands:

```bash
npm install -g wrangler
wrangler login
wrangler deploy
```

Wrangler prints your Worker URL, e.g.:
```
https://vibecodersai.YOUR-SUBDOMAIN.workers.dev
```
Your chat endpoint is that URL + `/api/chat`.

### 2.2 Deploy via Cloudflare dashboard

1. **Workers & Pages → Create application → Create Worker**.
2. Name it `vibecodersai`.
3. **Edit code**, paste the contents of `worker.js`, **Save and deploy**.

### 2.3 Add your API keys as secrets

```bash
wrangler secret put OPENROUTER_API_KEY
wrangler secret put GROQ_API_KEY
wrangler secret put GEMINI_API_KEY
```

Or in the dashboard: **Worker → Settings → Variables → Environment Variables → Add variable** (mark each as **Encrypt**).

You can skip any provider you don't have a key for — Pollinations works as a
fallback with no key.

Test the deployment by visiting your Worker root URL — you should see
`VibeCodersAI backend is running.`

---

## 3. Connect the frontend to the backend

Pick **one** of these — easiest first:

### Option A — Same-origin rewrite (no JS edit)

If you deploy the frontend to Netlify or Vercel, just replace the placeholder
URL in the included config file:

- **Netlify:** edit `netlify.toml` → replace `https://vibecodersai.YOUR-SUBDOMAIN.workers.dev/api/chat` with your real Worker URL.
- **Vercel:** edit `vercel.json` → same replacement.

The frontend already calls `/api/chat` on its own origin, and the host
proxies it to your Worker. No `script.js` edit needed.

### Option B — Edit `script.js`

Open `script.js` and update `DIRECT_WORKER_URL`:

```js
const DIRECT_WORKER_URL =
  "https://vibecodersai.YOUR-SUBDOMAIN.workers.dev/api/chat";
```

### Option C — Runtime override (no rebuild)

In `index.html`, before `<script src="script.js" defer></script>`:

```html
<script>window.VIBECODERSAI_BACKEND_URL = "https://your-worker.workers.dev/api/chat";</script>
```

---

## 4. Deploy the frontend (static site)

The frontend is just `index.html`, `style.css`, and `script.js`. Any static
host works.

### Render (Static Site)

1. Push this repo to GitHub.
2. On [Render](https://render.com) → **New → Static Site** → connect the repo.
3. **Build command:** *(leave empty)*
4. **Publish directory:** `.` (the repo root)
5. Click **Create Static Site**.
6. Open the deployed URL — VibeCodersAI loads.

### Netlify

1. Push the repo to GitHub.
2. On [Netlify](https://netlify.com) → **Add new site → Import existing project**.
3. **Build command:** *(empty)* · **Publish directory:** `.`
4. Deploy.

### Vercel

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new).
2. **Framework Preset:** *Other* · **Build / Output:** leave defaults (none).
3. Deploy.

### GitHub Pages

1. Push to a `main` branch.
2. **Settings → Pages → Source → Deploy from branch → `main` / `(root)`**.
3. Wait ~1 minute, then open the GitHub Pages URL.

---

## 5. Test the chatbot

1. Open the deployed frontend in your browser (mobile or desktop).
2. Type a message and press **Send** (or hit Enter).
3. Watch for `VibeCodersAI is thinking...` and the response.
4. The provider badge in the top-right shows which provider answered
   (e.g. `openrouter`, `groq`, `gemini`, or `pollinations`).
5. Try the **Settings** panel: change Mode (e.g. *Coding Assistant* or
   *Tagalog Assistant*) and Model. Try **Export .txt** and **Clear chat**.

---

## 6. Troubleshooting

| Problem | Fix |
|---|---|
| `Backend not configured.` shown in the chat | You haven't pointed the frontend at a real Worker URL. See §3 — pick Option A, B, or C. |
| `Network error. Please check your connection...` | Worker URL is wrong, or CORS is blocked. Verify the URL by visiting it directly — it should say `VibeCodersAI backend is running.` |
| `Sorry, the AI service is temporarily unavailable.` | All configured providers failed. Check your Cloudflare Worker logs (`wrangler tail`) and verify your secrets are set. Pollinations should still work as a fallback even with no keys. |
| `You're sending messages too quickly.` | Built-in rate limit (30 req / minute / IP). Wait a moment. |
| Worker returns 404 | Make sure you POST to `/api/chat`, not `/`. |
| Provider badge stuck on `idle` | The first message hasn't completed yet, or all providers failed. |
| Responses look like raw markdown | Expected. The frontend renders code blocks, **bold**, *italic*, `inline code`, and lists. |

To watch live worker logs:
```bash
wrangler tail
```

---

## 7. How to add or remove AI providers

All provider logic is inside `worker.js`. Each provider is a small async
function:

```js
callOpenRouter(env, payload)
callGroq(env, payload)
callGemini(env, payload)
callPollinations(env, payload)
```

To **add** a provider:

1. Write a new `callMyProvider(env, payload)` function that returns the AI's
   reply as a string (or throws on failure).
2. Add a case in `callProvider(name, env, payload)`.
3. Add it to `isProviderConfigured(name, env)` so the chain knows whether the
   key is present.
4. Add its name to the `all` array in `providerChain(preferred)` in your
   preferred fallback order.
5. Optionally update `preferredProviderFor(model)` so a specific model name
   prefers your new provider.
6. Add corresponding `<option>` entries in `index.html`.

To **remove** a provider, delete its entry from those four spots.

---

## 8. Chat modes

Each mode sends a tailored system prompt to the AI. Defined in
`worker.js → MODE_PROMPTS`:

- `chat` — Normal Chat
- `coding` — Coding Assistant (Codex-like)
- `tagalog` — Tagalog / Taglish replies
- `creative` — Creative Writer (scripts, captions, reels)
- `prompt` — Prompt Engineer
- `business` — Business Helper
- `builder` — Web App Builder Helper

To customize a mode, edit its string in `MODE_PROMPTS`.

---

## 9. Security notes

- **API keys never touch the browser.** They live as Cloudflare Worker
  encrypted secrets and are read only inside `worker.js` via `env.*`.
- **CORS** is open by default (`Access-Control-Allow-Origin: *`) so you can
  host the frontend anywhere. To lock it down to a specific domain, change the
  `ALLOWED_ORIGINS` constant in `worker.js`.
- **Input validation** — empty messages and oversized messages (> 8000 chars)
  are rejected.
- **Rate limiting** — a simple in-memory limiter (30 req/min/IP) protects
  against casual abuse. For stronger limits, use Cloudflare's built-in
  rate-limiting rules or KV/Durable Objects.
- **Output sanitization** — the frontend never uses `innerHTML` for chat
  content. User messages are rendered with `textContent`. AI messages go
  through a small allowlist Markdown renderer that creates only safe DOM
  elements (`p`, `br`, `strong`, `em`, `code`, `pre`, `ul`, `li`).
- **No localStorage secrets** — only chat history, theme, mode, and model are
  stored locally. Never any keys.
- **Friendly errors only** — raw provider errors are logged to the Worker
  (visible via `wrangler tail`) but never returned to the user.

---

## 10. Support VibeCodersAI

If this tool helps you, you can donate any amount.

**GCash:** `09482887486`

---

## 11. License

MIT — do whatever you want, just keep the notice. VibeCodersAI branding is
yours to keep or rename.
