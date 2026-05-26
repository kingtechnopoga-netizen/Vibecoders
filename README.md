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

## 1. File overview

```
.
├── index.html      # Static frontend
├── style.css       # Premium red crystal UI
├── script.js       # Frontend logic (calls the Worker, no API keys here)
├── worker.js       # Cloudflare Worker backend proxy
└── README.md       # This file
```

---

## 2. Deploy the backend (Cloudflare Worker)

You need a free Cloudflare account.

### Option A — One-time deploy with Wrangler CLI (recommended)

1. Install Node.js 18+ and Wrangler:
   ```bash
   npm install -g wrangler
   wrangler login
   ```

2. From the project folder, create a minimal `wrangler.toml`:
   ```toml
   name = "vibecodersai"
   main = "worker.js"
   compatibility_date = "2024-10-01"
   ```

3. Add your secrets (run each, paste the key when prompted):
   ```bash
   wrangler secret put OPENROUTER_API_KEY
   wrangler secret put GROQ_API_KEY
   wrangler secret put GEMINI_API_KEY
   ```
   You can skip any provider you don't have a key for — Pollinations always
   works as a fallback.

4. Deploy:
   ```bash
   wrangler deploy
   ```

5. Wrangler will print your Worker URL, e.g.:
   ```
   https://vibecodersai.YOUR-SUBDOMAIN.workers.dev
   ```
   Your chat endpoint is:
   ```
   https://vibecodersai.YOUR-SUBDOMAIN.workers.dev/api/chat
   ```

### Option B — Cloudflare dashboard

1. Go to **Workers & Pages → Create application → Create Worker**.
2. Name it `vibecodersai` (or anything you like).
3. Click **Edit code**, paste the contents of `worker.js`, click **Save and deploy**.
4. Open the worker → **Settings → Variables → Environment Variables**.
5. Add **Encrypted** variables:
   - `OPENROUTER_API_KEY`
   - `GROQ_API_KEY`
   - `GEMINI_API_KEY`
   (Skip any you don't have.)
6. Re-deploy if prompted.

Test the deployment by visiting the worker root URL in a browser — you should
see `VibeCodersAI backend is running.`

---

## 3. Connect the frontend to the backend

Open `script.js` and update the `BACKEND_URL` constant near the top:

```js
const BACKEND_URL =
  "https://vibecodersai.YOUR-SUBDOMAIN.workers.dev/api/chat";
```

That's the only change you need on the frontend.

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
| `Backend URL not set.` shown in the chat | You forgot to update `BACKEND_URL` in `script.js`. |
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
