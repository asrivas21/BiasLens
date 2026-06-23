# Bias Lens — Implementation Plan
**Status:** Pre-upgrade | **Target stack:** Next.js · TypeScript · Python FastAPI · Supabase · Clerk · Vercel  
**Estimated total time:** 3–4 weekends of focused work

---

## Overview of changes

| # | Improvement | New tech added | Effort |
|---|---|---|---|
| 0 | **Short-form content analyzer** *(new)* | Whisper, yt-dlp, TypeScript | High |
| 1 | Deploy on Vercel | Vercel CLI | Low |
| 2 | Python FastAPI bias detection microservice | Python, HuggingFace | Medium |
| 3 | D3.js bias timeline chart | D3.js | Medium |
| 4 | GitHub Actions CI + Playwright e2e tests | Playwright, GH Actions | Medium |
| 5 | User accounts + saved analyses | Clerk, Supabase | High |

---

## Priority order

```
Week 1:  Improvement 1  →  Improvement 2  →  Improvement 0
Week 2:  Improvement 3  →  Improvement 4
Week 3:  Improvement 5
```

Deploy first so every subsequent change ships live. Short-form feature (0) comes after the backend microservice (2) is in place since it shares the same bias detection pipeline.

---

## Improvement 1 — Deploy on Vercel

**Goal:** Get a live public URL before touching any new features.

### Steps

**1.1 — Install Vercel CLI and link the project**
```bash
npm i -g vercel
cd bias-lens
vercel login
vercel link        # follow prompts, select your GitHub account
vercel env pull    # pulls existing .env.local down
```

**1.2 — Audit environment variables**

Every key currently in your `.env.local` needs to be added to Vercel's dashboard before deploying:
- Go to `vercel.com/dashboard → your project → Settings → Environment Variables`
- Add each key from `.env.local` one by one
- Mark sensitive keys (API keys, secrets) as "Sensitive" so they're write-only in the UI

**1.3 — Fix any hardcoded localhost references**

Search the codebase for `localhost` before deploying:
```bash
grep -r "localhost" src/
```
Replace any hardcoded `http://localhost:3000` with `process.env.NEXT_PUBLIC_BASE_URL` and add that variable to both `.env.local` and Vercel.

**1.4 — Deploy**
```bash
vercel --prod
```

**1.5 — Add the live URL everywhere**
- GitHub repo → Edit → Website field
- GitHub repo README → top badge: `[![Live Demo](https://img.shields.io/badge/demo-live-green)](https://your-url.vercel.app)`
- LinkedIn featured section
- Resume project link

**1.6 — Set up automatic deploys**

In Vercel dashboard → Git → connect your GitHub repo → enable "Deploy on push to main." Every future push auto-deploys. No manual steps needed after this.

---

## Improvement 2 — Python FastAPI bias detection microservice

**Goal:** Replace any prompt-only or rule-based bias detection with a real HuggingFace NLP model served via a Python API. The Next.js frontend calls this service instead of doing inference inline.

### Architecture

```
Browser → Next.js (Vercel) → /api/analyze (Edge Function) → Python FastAPI (Render) → HuggingFace model
```

### Steps

**2.1 — Create the Python microservice repo**

Create a new repo: `bias-lens-api`. Structure:
```
bias-lens-api/
├── main.py
├── models/
│   └── bias_detector.py
├── schemas/
│   └── request.py
├── requirements.txt
└── Dockerfile
```

**2.2 — Install dependencies**
```bash
pip install fastapi uvicorn transformers torch pydantic python-multipart
```

`requirements.txt`:
```
fastapi==0.111.0
uvicorn==0.29.0
transformers==4.41.0
torch==2.3.0
pydantic==2.7.0
python-multipart==0.0.9
```

**2.3 — Define the Pydantic request/response schemas**

`schemas/request.py`:
```python
from pydantic import BaseModel
from typing import Literal

class AnalyzeRequest(BaseModel):
    text: str
    content_type: Literal["article", "short_form", "transcript"] = "article"
    source_name: str | None = None

class BiasResult(BaseModel):
    label: str                    # "biased" | "non-biased"
    confidence: float             # 0.0 – 1.0
    political_lean: str           # "left" | "center" | "right" | "unclear"
    emotional_intensity: float    # 0.0 – 1.0
    top_phrases: list[str]        # phrases that most influenced the score
    content_type: str
```

**2.4 — Build the bias detector**

`models/bias_detector.py`:
```python
from transformers import pipeline, AutoTokenizer, AutoModelForSequenceClassification
import torch

class BiasDetector:
    def __init__(self):
        # Primary: bias detection
        self.bias_pipeline = pipeline(
            "text-classification",
            model="d4data/bias-detection-model",
            tokenizer="d4data/bias-detection-model",
            truncation=True,
            max_length=512
        )
        # Secondary: sentiment for emotional intensity proxy
        self.sentiment_pipeline = pipeline(
            "sentiment-analysis",
            model="cardiffnlp/twitter-roberta-base-sentiment-latest",
            truncation=True,
            max_length=512
        )

    def detect(self, text: str) -> dict:
        bias_result = self.bias_pipeline(text)[0]
        sentiment_result = self.sentiment_pipeline(text)[0]

        emotional_intensity = sentiment_result["score"] if sentiment_result["label"] != "neutral" else 0.1

        # Extract top influential phrases via simple token attribution
        # (upgrade to SHAP later for production)
        words = text.split()
        charged_words = [w for w in words if len(w) > 6][:5]  # placeholder

        return {
            "label": bias_result["label"].lower(),
            "confidence": round(bias_result["score"], 4),
            "emotional_intensity": round(emotional_intensity, 4),
            "top_phrases": charged_words,
        }
```

**2.5 — Build the FastAPI app**

`main.py`:
```python
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from models.bias_detector import BiasDetector
from schemas.request import AnalyzeRequest, BiasResult

detector = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    global detector
    detector = BiasDetector()   # load models once at startup
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://your-bias-lens.vercel.app", "http://localhost:3000"],
    allow_methods=["POST"],
    allow_headers=["*"],
)

@app.post("/analyze", response_model=BiasResult)
async def analyze(req: AnalyzeRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
    if len(req.text) > 10000:
        raise HTTPException(status_code=400, detail="Text exceeds 10,000 character limit")

    result = detector.detect(req.text)
    return BiasResult(
        **result,
        political_lean="unclear",   # extend later with a political lean model
        content_type=req.content_type
    )

@app.get("/health")
def health():
    return {"status": "ok"}
```

**2.6 — Deploy to Render (free tier)**
- Push `bias-lens-api` to GitHub
- Go to render.com → New Web Service → connect the repo
- Set build command: `pip install -r requirements.txt`
- Set start command: `uvicorn main:app --host 0.0.0.0 --port 8000`
- Set environment to Python 3.11
- Note the service URL: `https://bias-lens-api.onrender.com`

**2.7 — Update Next.js to call the microservice**

Add to Vercel environment variables:
```
BIAS_API_URL=https://bias-lens-api.onrender.com
```

Create `src/app/api/analyze/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

export async function POST(req: NextRequest) {
  const body = await req.json();

  const res = await fetch(`${process.env.BIAS_API_URL}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Analysis failed" }, { status: 500 });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
```

---

## Improvement 0 — Short-form content analyzer (new feature)

**Goal:** Allow users to paste a TikTok, YouTube Short, or Instagram Reel URL and get a bias/sentiment analysis of the spoken content. This is the novel feature that no existing media bias tool covers.

### Why this matters
Short-form video is now the primary news consumption format for people under 30. Existing bias tools (AllSides, Ad Fontes) only cover text. Bias Lens becomes the first tool to bridge that gap — and it's a genuinely defensible product angle you can talk about in interviews.

### Architecture

```
User pastes URL
     ↓
Next.js API route → yt-dlp (audio download) → Whisper (transcription)
     ↓
transcript → FastAPI /analyze (same pipeline as Improvement 2)
     ↓
BiasResult + transcript returned to frontend
```

### Steps

**0.1 — Add short-form processing to the Python microservice**

Install additional dependencies in `bias-lens-api`:
```bash
pip install openai-whisper yt-dlp ffmpeg-python
```

Add to `requirements.txt`:
```
openai-whisper==20231117
yt-dlp==2024.5.27
ffmpeg-python==0.2.0
```

**0.2 — Add the transcription module**

`models/transcriber.py`:
```python
import whisper
import yt_dlp
import tempfile
import os
from pathlib import Path

class VideoTranscriber:
    SUPPORTED_DOMAINS = [
        "tiktok.com", "youtube.com", "youtu.be",
        "instagram.com", "twitter.com", "x.com"
    ]
    MAX_DURATION_SECONDS = 180  # 3 minutes — short-form only

    def __init__(self):
        self.model = whisper.load_model("base")  # upgrade to "small" for better accuracy

    def _is_supported(self, url: str) -> bool:
        return any(domain in url for domain in self.SUPPORTED_DOMAINS)

    def _download_audio(self, url: str, output_path: str) -> int:
        """Downloads audio and returns duration in seconds."""
        ydl_opts = {
            "format": "bestaudio/best",
            "outtmpl": output_path,
            "postprocessors": [{
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "128",
            }],
            "quiet": True,
            "no_warnings": True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            return info.get("duration", 0)

    def transcribe(self, url: str) -> dict:
        if not self._is_supported(url):
            raise ValueError(f"Unsupported platform. Supported: {self.SUPPORTED_DOMAINS}")

        with tempfile.TemporaryDirectory() as tmpdir:
            audio_path = os.path.join(tmpdir, "audio")
            duration = self._download_audio(url, audio_path)

            if duration > self.MAX_DURATION_SECONDS:
                raise ValueError(f"Video exceeds {self.MAX_DURATION_SECONDS}s limit for short-form analysis")

            mp3_path = audio_path + ".mp3"
            result = self.model.transcribe(mp3_path)

            return {
                "transcript": result["text"].strip(),
                "language": result["language"],
                "duration_seconds": duration,
                "segments": [
                    {"start": s["start"], "end": s["end"], "text": s["text"]}
                    for s in result["segments"]
                ]
            }
```

**0.3 — Add the /transcribe endpoint to FastAPI**

Add to `main.py`:
```python
from models.transcriber import VideoTranscriber
from pydantic import BaseModel, HttpUrl

transcriber = None  # initialize in lifespan alongside detector

class TranscribeRequest(BaseModel):
    url: str
    source_name: str | None = None

class TranscribeAndAnalyzeResponse(BaseModel):
    transcript: str
    language: str
    duration_seconds: int
    segments: list[dict]
    bias: BiasResult

@app.post("/transcribe-and-analyze", response_model=TranscribeAndAnalyzeResponse)
async def transcribe_and_analyze(req: TranscribeRequest):
    try:
        transcription = transcriber.transcribe(req.url)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to process video. Check the URL and try again.")

    bias_result = detector.detect(transcription["transcript"])

    return TranscribeAndAnalyzeResponse(
        transcript=transcription["transcript"],
        language=transcription["language"],
        duration_seconds=transcription["duration_seconds"],
        segments=transcription["segments"],
        bias=BiasResult(
            **bias_result,
            political_lean="unclear",
            content_type="short_form"
        )
    )
```

**0.4 — Update lifespan to initialize transcriber**

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    global detector, transcriber
    detector = BiasDetector()
    transcriber = VideoTranscriber()
    yield
```

**0.5 — Add a Next.js API route for short-form**

`src/app/api/short-form/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";

export const runtime = "edge";

const SUPPORTED_PATTERNS = [
  /tiktok\.com/,
  /youtube\.com\/shorts/,
  /youtu\.be/,
  /instagram\.com\/reels/,
  /twitter\.com/,
  /x\.com/,
];

function isValidShortFormUrl(url: string): boolean {
  return SUPPORTED_PATTERNS.some((pattern) => pattern.test(url));
}

export async function POST(req: NextRequest) {
  const { url, sourceName } = await req.json();

  if (!url || !isValidShortFormUrl(url)) {
    return NextResponse.json(
      { error: "Invalid or unsupported URL. Paste a TikTok, YouTube Short, Instagram Reel, or X video link." },
      { status: 400 }
    );
  }

  const res = await fetch(`${process.env.BIAS_API_URL}/transcribe-and-analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url, source_name: sourceName }),
  });

  if (!res.ok) {
    const err = await res.json();
    return NextResponse.json({ error: err.detail ?? "Processing failed" }, { status: 500 });
  }

  return NextResponse.json(await res.json());
}
```

**0.6 — Build the short-form UI component**

`src/components/ShortFormAnalyzer.tsx`:
```tsx
"use client";

import { useState } from "react";

type AnalysisState = "idle" | "loading" | "done" | "error";

interface ShortFormResult {
  transcript: string;
  language: string;
  duration_seconds: number;
  bias: {
    label: string;
    confidence: number;
    emotional_intensity: number;
    top_phrases: string[];
    political_lean: string;
  };
}

const PLATFORM_HINTS = [
  { name: "TikTok", example: "tiktok.com/@user/video/..." },
  { name: "YouTube Shorts", example: "youtube.com/shorts/..." },
  { name: "Instagram Reels", example: "instagram.com/reels/..." },
  { name: "X / Twitter", example: "x.com/user/status/..." },
];

export function ShortFormAnalyzer() {
  const [url, setUrl] = useState("");
  const [sourceName, setSourceName] = useState("");
  const [state, setState] = useState<AnalysisState>("idle");
  const [result, setResult] = useState<ShortFormResult | null>(null);
  const [error, setError] = useState("");

  async function handleAnalyze() {
    if (!url.trim()) return;
    setState("loading");
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/short-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, sourceName }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        setState("error");
        return;
      }

      setResult(data);
      setState("done");
    } catch {
      setError("Network error. Try again.");
      setState("error");
    }
  }

  return (
    <div className="space-y-4">
      {/* URL input */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-gray-700">
          Paste a short-form video URL
        </label>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.tiktok.com/@creator/video/..."
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="text"
          value={sourceName}
          onChange={(e) => setSourceName(e.target.value)}
          placeholder="Creator / account name (optional)"
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
        <p className="text-xs text-gray-400">
          Supports: {PLATFORM_HINTS.map((p) => p.name).join(" · ")}
        </p>
      </div>

      <button
        onClick={handleAnalyze}
        disabled={state === "loading" || !url.trim()}
        className="w-full bg-black text-white rounded-lg py-2 text-sm font-medium disabled:opacity-40"
      >
        {state === "loading" ? "Transcribing & analyzing..." : "Analyze video"}
      </button>

      {state === "loading" && (
        <p className="text-xs text-gray-400 text-center">
          Downloading audio → transcribing → detecting bias. Usually 15–30 seconds.
        </p>
      )}

      {state === "error" && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {state === "done" && result && (
        <div className="space-y-4 pt-2">
          {/* Bias score card */}
          <div className="border rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Bias score</span>
              <span className={`text-sm font-semibold ${result.bias.label === "biased" ? "text-red-500" : "text-green-600"}`}>
                {result.bias.label === "biased" ? "Biased" : "Non-biased"} · {Math.round(result.bias.confidence * 100)}% confidence
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-500">Emotional intensity</span>
              <div className="flex items-center gap-2">
                <div className="w-24 h-1.5 bg-gray-100 rounded-full">
                  <div
                    className="h-full bg-amber-400 rounded-full"
                    style={{ width: `${result.bias.emotional_intensity * 100}%` }}
                  />
                </div>
                <span className="text-xs text-gray-500">
                  {Math.round(result.bias.emotional_intensity * 100)}%
                </span>
              </div>
            </div>
            {result.bias.top_phrases.length > 0 && (
              <div>
                <p className="text-xs text-gray-400 mb-1">Charged phrases</p>
                <div className="flex flex-wrap gap-1">
                  {result.bias.top_phrases.map((phrase) => (
                    <span key={phrase} className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">
                      {phrase}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Transcript */}
          <div className="border rounded-lg p-4">
            <p className="text-xs text-gray-400 mb-2">
              Transcript · {result.duration_seconds}s · {result.language.toUpperCase()}
            </p>
            <p className="text-sm text-gray-700 leading-relaxed">{result.transcript}</p>
          </div>
        </div>
      )}
    </div>
  );
}
```

**0.7 — Add a tab to the main page**

In your main page or layout, add a tab toggle between "Article / text" and "Short-form video" that renders either the existing text analysis component or `<ShortFormAnalyzer />`.

**0.8 — Handle Render cold starts**

Render's free tier spins down after inactivity. Add a keep-alive ping from the Next.js frontend:

`src/app/api/ping/route.ts`:
```typescript
export async function GET() {
  await fetch(`${process.env.BIAS_API_URL}/health`);
  return new Response("ok");
}
```

Call this in a `useEffect` on app load so the Python service is warm by the time a user submits content.

---

## Improvement 3 — D3.js bias timeline chart

**Goal:** Let users paste multiple articles or video URLs from the same topic/creator across different dates and visualize how bias/emotional intensity shifts over time.

### Steps

**3.1 — Install D3**
```bash
npm install d3 @types/d3
```

**3.2 — Define the multi-analysis data model**

`src/types/timeline.ts`:
```typescript
export interface TimelineEntry {
  id: string;
  date: string;             // ISO 8601
  sourceName: string;
  contentType: "article" | "short_form" | "transcript";
  biasScore: number;        // 0–1, higher = more biased
  emotionalIntensity: number;
  label: "biased" | "non-biased";
  url?: string;
}
```

**3.3 — Build the D3 timeline component**

`src/components/BiasTimeline.tsx`:
```tsx
"use client";

import { useEffect, useRef } from "react";
import * as d3 from "d3";
import type { TimelineEntry } from "@/types/timeline";

interface BiasTimelineProps {
  entries: TimelineEntry[];
}

export function BiasTimeline({ entries }: BiasTimelineProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current || entries.length < 2) return;

    const width = svgRef.current.clientWidth;
    const height = 240;
    const margin = { top: 20, right: 20, bottom: 40, left: 40 };

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const x = d3.scaleTime()
      .domain(d3.extent(entries, (d) => new Date(d.date)) as [Date, Date])
      .range([margin.left, width - margin.right]);

    const y = d3.scaleLinear()
      .domain([0, 1])
      .range([height - margin.bottom, margin.top]);

    // Bias score line
    const biasLine = d3.line<TimelineEntry>()
      .x((d) => x(new Date(d.date)))
      .y((d) => y(d.biasScore))
      .curve(d3.curveMonotoneX);

    // Emotional intensity line
    const intensityLine = d3.line<TimelineEntry>()
      .x((d) => x(new Date(d.date)))
      .y((d) => y(d.emotionalIntensity))
      .curve(d3.curveMonotoneX);

    // Axes
    svg.append("g")
      .attr("transform", `translate(0,${height - margin.bottom})`)
      .call(d3.axisBottom(x).ticks(5).tickFormat(d3.timeFormat("%b %d") as any))
      .attr("font-size", "11px");

    svg.append("g")
      .attr("transform", `translate(${margin.left},0)`)
      .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format(".0%")))
      .attr("font-size", "11px");

    // Bias line
    svg.append("path")
      .datum(entries)
      .attr("fill", "none")
      .attr("stroke", "#ef4444")
      .attr("stroke-width", 2)
      .attr("d", biasLine);

    // Emotional intensity line
    svg.append("path")
      .datum(entries)
      .attr("fill", "none")
      .attr("stroke", "#f59e0b")
      .attr("stroke-width", 2)
      .attr("stroke-dasharray", "4 2")
      .attr("d", intensityLine);

    // Dots on bias line
    svg.selectAll(".bias-dot")
      .data(entries)
      .join("circle")
      .attr("cx", (d) => x(new Date(d.date)))
      .attr("cy", (d) => y(d.biasScore))
      .attr("r", 4)
      .attr("fill", (d) => d.label === "biased" ? "#ef4444" : "#22c55e");

    // Legend
    const legend = svg.append("g").attr("transform", `translate(${margin.left + 8}, ${margin.top})`);
    legend.append("line").attr("x1", 0).attr("x2", 16).attr("stroke", "#ef4444").attr("stroke-width", 2);
    legend.append("text").attr("x", 20).attr("y", 4).attr("font-size", "11px").text("Bias score");
    legend.append("line").attr("x1", 0).attr("x2", 16).attr("y1", 16).attr("y2", 16).attr("stroke", "#f59e0b").attr("stroke-width", 2).attr("stroke-dasharray", "4 2");
    legend.append("text").attr("x", 20).attr("y", 20).attr("font-size", "11px").text("Emotional intensity");

  }, [entries]);

  if (entries.length < 2) {
    return (
      <p className="text-sm text-gray-400 text-center py-8">
        Add at least 2 analyses to see the bias timeline.
      </p>
    );
  }

  return (
    <div>
      <p className="text-xs text-gray-400 mb-2">Bias score over time · {entries.length} data points</p>
      <svg ref={svgRef} width="100%" height={240} />
    </div>
  );
}
```

**3.4 — Wire the timeline to the app state**

In your main page component, accumulate results in a `useState<TimelineEntry[]>` array. Each time a user submits a new analysis (article or short-form), append the result to the array and pass it to `<BiasTimeline entries={entries} />`.

---

## Improvement 4 — GitHub Actions CI + Playwright e2e tests

**Goal:** Green CI badge on the repo. Proves you understand production engineering discipline.

### Steps

**4.1 — Install Playwright**
```bash
npm install -D @playwright/test
npx playwright install --with-deps chromium
```

**4.2 — Write e2e tests**

`tests/bias-lens.spec.ts`:
```typescript
import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

test.describe("Article analysis", () => {
  test("loads and renders the main input", async ({ page }) => {
    await page.goto(BASE_URL);
    await expect(page.getByRole("heading", { name: /bias lens/i })).toBeVisible();
    await expect(page.getByPlaceholder(/paste article/i)).toBeVisible();
  });

  test("returns a bias result for submitted text", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.getByPlaceholder(/paste article/i).fill(
      "Politicians are destroying the country with their reckless policies. The radical agenda is tearing families apart."
    );
    await page.getByRole("button", { name: /analyze/i }).click();
    await expect(page.getByText(/biased|non-biased/i)).toBeVisible({ timeout: 15000 });
  });

  test("shows error for empty submission", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.getByRole("button", { name: /analyze/i }).click();
    await expect(page.getByText(/enter some text/i)).toBeVisible();
  });
});

test.describe("Short-form tab", () => {
  test("short-form tab is accessible", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.getByRole("tab", { name: /short.form/i }).click();
    await expect(page.getByPlaceholder(/tiktok|youtube/i)).toBeVisible();
  });

  test("shows unsupported URL error", async ({ page }) => {
    await page.goto(BASE_URL);
    await page.getByRole("tab", { name: /short.form/i }).click();
    await page.getByPlaceholder(/tiktok|youtube/i).fill("https://example.com/not-a-video");
    await page.getByRole("button", { name: /analyze/i }).click();
    await expect(page.getByText(/invalid|unsupported/i)).toBeVisible({ timeout: 5000 });
  });
});
```

**4.3 — Configure Playwright**

`playwright.config.ts`:
```typescript
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  timeout: 30000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    headless: true,
  },
  webServer: process.env.CI ? undefined : {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
  },
});
```

**4.4 — Add GitHub Actions workflow**

`.github/workflows/ci.yml`:
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install --with-deps chromium

      - name: Run e2e tests
        run: npx playwright test
        env:
          PLAYWRIGHT_BASE_URL: ${{ secrets.VERCEL_PREVIEW_URL }}
          NEXT_PUBLIC_BASE_URL: ${{ secrets.VERCEL_PREVIEW_URL }}

      - name: Upload test report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: playwright-report
          path: playwright-report/
```

**4.5 — Add the CI badge to README**

```markdown
[![CI](https://github.com/asrivas21/bias-lens/actions/workflows/ci.yml/badge.svg)](https://github.com/asrivas21/bias-lens/actions)
```

---

## Improvement 5 — User accounts + saved analyses (Clerk + Supabase)

**Goal:** Users can sign in, every analysis they run is saved, and they can revisit, search, and share past results via a public link.

### Steps

**5.1 — Set up Supabase**
- Go to supabase.com → new project
- In the SQL editor, run:

```sql
create table analyses (
  id           uuid primary key default gen_random_uuid(),
  user_id      text not null,
  created_at   timestamptz default now(),
  content_type text not null check (content_type in ('article', 'short_form', 'transcript')),
  source_name  text,
  input_text   text,
  input_url    text,
  transcript   text,
  bias_label   text,
  bias_score   numeric(4,3),
  emotional_intensity numeric(4,3),
  political_lean text,
  top_phrases  text[],
  is_public    boolean default false,
  share_slug   text unique
);

create index on analyses (user_id, created_at desc);
create index on analyses (share_slug) where share_slug is not null;
```

**5.2 — Set up Clerk**
- Go to clerk.com → new application → enable Email + Google sign-in
- Install:
```bash
npm install @clerk/nextjs
```
- Add to `.env.local`:
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
```
- Wrap `app/layout.tsx` in `<ClerkProvider>` and add `<SignInButton>` / `<UserButton>` to your nav

**5.3 — Install Supabase client**
```bash
npm install @supabase/supabase-js
```

`src/lib/supabase.ts`:
```typescript
import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

**5.4 — Save analyses after each run**

`src/app/api/save-analysis/route.ts`:
```typescript
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { supabase } from "@/lib/supabase";
import { nanoid } from "nanoid";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const shareSlug = nanoid(10);

  const { data, error } = await supabase
    .from("analyses")
    .insert({
      user_id: userId,
      content_type: body.contentType,
      source_name: body.sourceName,
      input_text: body.inputText,
      input_url: body.inputUrl,
      transcript: body.transcript,
      bias_label: body.bias.label,
      bias_score: body.bias.confidence,
      emotional_intensity: body.bias.emotionalIntensity,
      political_lean: body.bias.politicalLean,
      top_phrases: body.bias.topPhrases,
      share_slug: shareSlug,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data.id, shareSlug });
}
```

**5.5 — Build the saved analyses dashboard**

`src/app/history/page.tsx`:
```tsx
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default async function HistoryPage() {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  const { data: analyses } = await supabase
    .from("analyses")
    .select("id, created_at, content_type, source_name, bias_label, bias_score, share_slug")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(50);

  return (
    <div className="max-w-2xl mx-auto py-10 px-4">
      <h1 className="text-xl font-medium mb-6">Your analyses</h1>
      <div className="space-y-2">
        {analyses?.map((a) => (
          <div key={a.id} className="border rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{a.source_name ?? "Untitled"}</p>
              <p className="text-xs text-gray-400">{a.content_type} · {new Date(a.created_at).toLocaleDateString()}</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${a.bias_label === "biased" ? "bg-red-50 text-red-600" : "bg-green-50 text-green-600"}`}>
                {a.bias_label} · {Math.round(a.bias_score * 100)}%
              </span>
              <a href={`/share/${a.share_slug}`} className="text-xs text-blue-500 underline">
                Share
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**5.6 — Build the public share page**

`src/app/share/[slug]/page.tsx`:
```tsx
import { supabase } from "@/lib/supabase";
import { notFound } from "next/navigation";

export default async function SharePage({ params }: { params: { slug: string } }) {
  const { data } = await supabase
    .from("analyses")
    .select("*")
    .eq("share_slug", params.slug)
    .single();

  if (!data) notFound();

  return (
    <div className="max-w-xl mx-auto py-10 px-4">
      <p className="text-xs text-gray-400 mb-1">{data.content_type} · {data.source_name}</p>
      <h1 className="text-xl font-medium mb-4">Bias analysis</h1>
      <div className="border rounded-lg p-4 space-y-2">
        <p className="text-sm"><span className="font-medium">Result:</span> {data.bias_label}</p>
        <p className="text-sm"><span className="font-medium">Confidence:</span> {Math.round(data.bias_score * 100)}%</p>
        <p className="text-sm"><span className="font-medium">Emotional intensity:</span> {Math.round(data.emotional_intensity * 100)}%</p>
        {data.transcript && (
          <div className="pt-2 border-t">
            <p className="text-xs text-gray-400 mb-1">Transcript</p>
            <p className="text-sm text-gray-700">{data.transcript}</p>
          </div>
        )}
      </div>
      <p className="text-xs text-gray-400 mt-4 text-center">
        Analyzed with <a href="/" className="underline">Bias Lens</a>
      </p>
    </div>
  );
}
```

---

## Final README structure

After all improvements are shipped, your README should contain:

```markdown
# Bias Lens

Detect political bias and emotional framing in articles and short-form video.
Supports TikTok, YouTube Shorts, Instagram Reels, and X.

[![Live Demo](https://img.shields.io/badge/demo-live-green)](https://bias-lens.vercel.app)
[![CI](https://github.com/asrivas21/bias-lens/actions/workflows/ci.yml/badge.svg)](...)

## Stack
- **Frontend:** Next.js 14, TypeScript, D3.js, Tailwind — deployed on Vercel
- **Backend:** Python FastAPI, Whisper, HuggingFace Transformers — deployed on Render
- **Auth + DB:** Clerk, Supabase (PostgreSQL + pgvector)
- **CI:** GitHub Actions + Playwright e2e

## Features
- Article and long-form text analysis
- Short-form video analysis (TikTok / YouTube Shorts / Reels / X) via Whisper transcription
- Bias timeline chart (D3.js) — track a source's bias over time
- Saved analyses with shareable public links
- User accounts via Clerk

## Model
Uses `d4data/bias-detection-model` (HuggingFace) for bias classification
and `cardiffnlp/twitter-roberta-base-sentiment-latest` for emotional intensity.

## Local setup
...
```

---

## Tech added to your GitHub profile by this project alone

| Language / tool | Where it appears |
|---|---|
| TypeScript | Next.js frontend, CDK, API routes |
| Python | FastAPI microservice, Whisper, HuggingFace |
| D3.js / JavaScript | BiasTimeline component |
| SQL | Supabase schema |
| GitHub Actions (YAML) | CI workflow |
| Playwright | e2e test suite |
| Docker | Render deployment of FastAPI service |
