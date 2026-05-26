# VibeCodersAI

**VibeCodersAI** — a premium AI coding & creative assistant. Real chatbot,
real backend, real AI. Mobile-first red-crystal UI.

---

## 🚀 Easiest possible path (works in 60 seconds, no signup)

**The app is already designed to work with zero setup.** When no backend is
configured, it talks to [Pollinations AI](https://pollinations.ai) directly
from your browser — no API keys, no servers, no deploy. You get real AI
responses immediately.

### Option 1 — Just open the file
1. Download or clone this repo.
2. Double-click `index.html`.
3. Type a message and hit Send. Done.

### Option 2 — Put it online with GitHub Pages (free, 2 clicks)
The repo is already on GitHub. To make it a public live website:

1. Go to https://github.com/kingtechnopoga-netizen/Vibecoders/settings/pages
2. Under **Source**, pick **Deploy from a branch** → branch **`main`** → folder **`/ (root)`** → **Save**.
3. Wait ~1 minute. Refresh the same Pages settings page — your live URL appears at the top.

That's it. You now have a public AI chatbot. The badge in the top-right
will say `free mode` to let you know you're using the free Pollinations
fallback.

> **No keys, no signup, nothing exposed.** The Pollinations service is
> publicly accessible and was designed for this.

---

## 🔥 Production path (premium AI, when you're ready)

Once the easy path is working, you can plug in **OpenRouter / Groq / Gemini**
for higher-quality responses. The backend is a Cloudflare Worker (free tier).

| Provider | Free signup |
|---|---|
| OpenRouter | https://openrouter.ai/keys |
| Groq | https://console.groq.com/keys |
| Gemini | https://aistudio.google.com/apikey |

**You only need ONE of them** (or none — Pollinations always works as
fallback).

### 3 commands to deploy the backend:
```bash
npm install -g wrangler
wrangler login                           # opens browser, sign in to Cloudflare
wrangler deploy                          # deploys worker.js, prints your URL
wrangler secret put OPENROUTER_API_KEY   # paste the key when asked
```
(Repeat the last line for `GROQ_API_KEY` / `GEMINI_API_KEY` if you have them.)

Wrangler prints something like:
```
https://vibecodersai.YOUR-SUBDOMAIN.workers.dev
```
Visit that URL — you should see `VibeCodersAI backend is running.`

### Then point the frontend at it (one of three ways):

**A. Easiest — runtime override.** Add this line to `index.html` just before
`<script src="script.js" defer>`:
```html
<script>window.VIBECODERSAI_BACKEND_URL = "https://vibecodersai.YOUR-SUBDOMAIN.workers.dev/api/chat";</script>
```
Commit, push — GitHub Pages redeploys automatically.

**B. Edit `script.js`.** Change `DIRECT_WORKER_URL` near the top.

**C. Same-origin proxy.** If you host on Netlify or Vercel, edit the
included `netlify.toml` / `vercel.json` to point `/api/chat` at your
Worker. The frontend already calls `/api/chat`.

That's it. The provider badge will switch from `free mode` to whichever
provider answered (`openrouter`, `groq`, `gemini`, or `pollinations`).

---

## 📂 What's in the repo

```
.
├── index.html      # Static frontend
├── style.css       # Premium red crystal UI
├── script.js       # Frontend logic (no API keys here)
├── worker.js       # Cloudflare Worker backend proxy
├── wrangler.toml   # Cloudflare config (one-command deploy)
├── netlify.toml    # Optional: same-origin /api/chat rewrite for Netlify
├── vercel.json     # Optional: same-origin /api/chat rewrite for Vercel
└── .github/workflows/pages.yml  # Auto-deploy to GitHub Pages
```

---

## ⚡ One-click deploy buttons

| Backend (Cloudflare Worker) | Frontend (static site) |
|---|---|
| [![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/kingtechnopoga-netizen/Vibecoders) | [![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/kingtechnopoga-netizen/Vibecoders) |
|  | [![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/kingtechnopoga-netizen/Vibecoders) |
|  | [![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/kingtechnopoga-netizen/Vibecoders) |

---

## 🧪 Testing the chatbot

1. Open the page. Welcome screen appears.
2. Top-right badge shows `free mode` (no backend) or a provider name.
3. Type → Send. Watch `VibeCodersAI is thinking...`.
4. Try the **Settings** panel: change Mode (Coding, Tagalog, Creative...),
   Model, Theme. Use **Export .txt** and **Clear chat**.
5. Try the chips on the welcome screen for one-tap prompts.

---

## 🆘 Troubleshooting

| Problem | Fix |
|---|---|
| Network error / blank reply | Could be a one-time hiccup with the AI service. Press **Retry**. |
| Provider badge stuck on `free mode` | Expected if you haven't deployed the worker. The chatbot still works. |
| `You're sending messages too quickly.` | Worker rate limit (30/min/IP). Wait ~30s. |
| Worker returns 404 | Make sure your URL ends in `/api/chat`. |
| Pages site is blank after deploy | Wait 1-2 minutes for the first GitHub Pages build. Refresh hard (Ctrl+Shift+R). |

Live worker logs:
```bash
wrangler tail
```

---

## 💬 Chat modes

Each mode sends a tailored system prompt to the AI:

- **Normal Chat** — everyday questions
- **Coding Assistant** — explain, generate, debug code (Codex-style)
- **Tagalog Assistant** — replies in natural Tagalog / Taglish
- **Creative Writer** — scripts, stories, captions, reels
- **Prompt Engineer** — improve & craft AI image / video / app prompts
- **Business Helper** — bios, product copy, marketing
- **Web App Builder Helper** — full-app code with deploy steps

Customize in `worker.js → MODE_PROMPTS` (and the matching
`CLIENT_MODE_PROMPTS` in `script.js` if you want to update the
no-backend fallback too).

---

## 🔌 Add or remove AI providers

In `worker.js`:

```js
callOpenRouter(env, payload)
callGroq(env, payload)
callGemini(env, payload)
callPollinations(env, payload)
```

To **add** a provider:
1. Add `callMyProvider(env, payload)` returning the reply string.
2. Add a case in `callProvider(name, env, payload)`.
3. Add it to `isProviderConfigured(name, env)`.
4. Add its name to `providerChain(preferred)`.
5. Add `<option>` entries in `index.html`.

To **remove**, delete those entries.

---

## 🔐 Security notes

- **API keys never touch the browser.** They are encrypted Cloudflare Worker
  secrets, read only inside `worker.js` via `env.*`.
- **CORS** is open by default. Lock it down via `ALLOWED_ORIGINS` in
  `worker.js`.
- **Input validation:** empty / >8000-char messages rejected.
- **Rate limiting:** 30 req/min/IP in-memory limiter on the worker.
- **Output sanitization:** `textContent` for user messages, allowlist
  Markdown renderer for AI replies (only `p`, `br`, `strong`, `em`, `code`,
  `pre`, `ul`, `li`).
- **No localStorage secrets:** only chat history, theme, mode, model.
- **Friendly errors only:** raw provider errors logged to worker, never
  shown to the user.
- **Pollinations direct fallback:** Pollinations is a public no-auth
  service. No keys are exposed because no keys are required.

---

## 💛 Support VibeCodersAI

If this tool helps you, you can donate any amount.

**GCash:** `09482887486`

---

## 📜 License

MIT — yours to keep, fork, rename, and ship.
