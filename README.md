# BiasLens

Most people read one source and call it news. BiasLens shows you what that framing is doing — 
and what it's leaving out.

Paste an article, drop a URL, or link a TikTok/YouTube Short/Reel. A multi-signal pipeline 
(local NLP + HuggingFace classifier + OpenAI) returns bias classification, sentiment scoring, 
entity framing, and a plain-language explanation of the rhetorical strategies in play.

[![Live Demo](https://img.shields.io/badge/demo-live-brightgreen)](https://your-url.vercel.app)
[![CI](https://github.com/asrivas21/BiasLens/actions/workflows/ci.yml/badge.svg)](https://github.com/asrivas21/BiasLens/actions)

> Polyglot stack: TypeScript (Next.js) · Python (FastAPI + Whisper + HuggingFace) · PostgreSQL
## What it does

Paste a news article, drop a URL, or link a short-form video (TikTok, YouTube Shorts, Instagram Reels, X). BiasLens runs the content through a multi-signal pipeline and returns:

- **Bias classification** — HuggingFace `d4data/bias-detection-model` labels the text as biased or non-biased with a confidence score
- **Sentiment analysis** — per-sentence scoring via wink-nlp with flagged charged terms highlighted
- **Named entity recognition** — tracks how entities (people, orgs, places) are framed and what sentiment surrounds them
- **LLM analysis** — OpenAI surfaces loaded language phrases, identifies political leaning on a −1 (far-left) to +1 (far-right) scale, and explains the article's framing strategy
- **Signal agreement** — cross-validates the NLP and LLM results to flag when they diverge
- **Short-form video** — downloads audio via yt-dlp, transcribes with Whisper, then runs the same bias pipeline on the transcript

Results are cached by content hash and saved to each user's account. Every analysis gets a shareable public link.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4, D3.js |
| API routes | Next.js App Router (`/app/api/`) |
| LLM | OpenAI (`gpt-4o-mini` default, `text-embedding-3-small` for caching) |
| Local NLP | wink-nlp + wink-sentiment, compromise |
| Bias classifier | Python FastAPI + HuggingFace Transformers (Docker, deployed on Render) |
| Transcription | OpenAI Whisper + yt-dlp (via Python microservice) |
| Auth + DB | Supabase (email auth, PostgreSQL) |
| Testing | Playwright e2e |
| Deployment | Vercel (frontend) · Render (Python microservice) |

---

## Architecture

```
Browser
  │
  └── Next.js on Vercel
        ├── /api/analyze        → NLP (local) + LLM (OpenAI) + HF classifier
        ├── /api/short-form     → Python microservice → Whisper + HF classifier
        ├── /api/analyses       → Supabase (history, pagination)
        └── /api/ping           → keep-alive for Render cold starts

Python FastAPI on Render
  ├── POST /analyze             → HuggingFace bias-detection-model
  └── POST /transcribe-and-analyze → yt-dlp + Whisper + HF classifier
```

---

## Features

- **Text analysis** — paste raw text up to 10,000 characters
- **URL analysis** — drop any article URL; the server fetches and extracts the article body via `@mozilla/readability`
- **Short-form video** — paste a TikTok, YouTube Short, Instagram Reel, or X video link; Whisper transcribes the audio then the full pipeline runs on the transcript
- **Per-sentence sentiment map** — charged terms are flagged inline
- **Entity sentiment** — see which named entities appear in biased or emotionally loaded contexts
- **LLM framing explanation** — plain-language summary of rhetorical strategies used
- **Political leaning score** — signed bias score from far-left to far-right
- **Analysis history** — signed-in users get a paginated history of every analysis they've run
- **Shareable links** — every result has a public `/share/[slug]` page
- **Result caching** — identical inputs return instantly without re-running inference
- **e2e test suite** — Playwright tests cover article analysis, short-form tab, and error states

---

## Local setup

### Prerequisites

- Node.js 20+
- Python 3.11+ (for the bias classifier microservice)
- ffmpeg (required by yt-dlp for audio extraction)

### 1. Frontend

```bash
npm install
cp .env.example .env.local
# Fill in the required keys (see Environment variables below)
npm run dev
```

### 2. Python microservice

```bash
cd bias-lens-api
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

The first startup downloads the HuggingFace models (~1 GB). Subsequent starts use the local cache.

### 3. Run tests

```bash
npx playwright install --with-deps chromium
npx playwright test
```

---

## Environment variables

Copy `.env.example` to `.env.local` and fill in:

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | Yes | OpenAI API key for LLM analysis and embeddings |
| `OPENAI_MODEL` | No | Model to use (default: `gpt-4o-mini`) |
| `OPENAI_EMBEDDING_MODEL` | No | Embedding model (default: `text-embedding-3-small`) |
| `SUPABASE_URL` | Yes | Supabase project URL (server-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Supabase service role key (server-side) |
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Supabase URL (exposed to browser for auth) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Supabase anon key (exposed to browser for auth) |
| `BIAS_API_URL` | No | Python microservice URL (default: `http://localhost:8000`) |

---

## Deployment

**Frontend (Vercel)**

```bash
vercel --prod
```

Add all environment variables under Settings → Environment Variables in the Vercel dashboard. Set `BIAS_API_URL` to the Render service URL.

**Python microservice (Render)**

The `bias-lens-api/Dockerfile` builds a ready-to-deploy image. In Render:
- New Web Service → connect the repo → set root directory to `bias-lens-api`
- Build command: `pip install -r requirements.txt`
- Start command: `uvicorn main:app --host 0.0.0.0 --port 8000`

---

## Project structure

```
app/
├── api/
│   ├── analyze/          # Main text/URL analysis route
│   ├── short-form/       # Short-form video route
│   ├── analyses/         # History list + individual result routes
│   ├── health/           # Health check
│   └── ping/             # Keep-alive for Render
├── history/              # User analysis history page
├── results/[id]/         # Individual result page
├── share/[slug]/         # Public shareable result page
└── sign-in/              # Auth page

bias-lens-api/
├── main.py               # FastAPI app
├── models/
│   ├── bias_detector.py  # HuggingFace bias classifier
│   └── transcriber.py    # Whisper + yt-dlp transcription
└── Dockerfile

types/
└── biaslens.ts           # Shared TypeScript types for the full API surface

tests/
└── bias-lens.spec.ts     # Playwright e2e tests
```
