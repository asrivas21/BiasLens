'use client';

import { useState } from 'react';
import type { ShortFormResult } from '@/types/biaslens';

type State = 'idle' | 'loading' | 'done' | 'error';

const PLATFORM_LABELS = ['TikTok', 'YouTube Shorts', 'Instagram Reels', 'X / Twitter'];

export function ShortFormAnalyzer() {
  const [url, setUrl] = useState('');
  const [sourceName, setSourceName] = useState('');
  const [state, setState] = useState<State>('idle');
  const [result, setResult] = useState<ShortFormResult | null>(null);
  const [error, setError] = useState('');

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || state === 'loading') return;
    setState('loading');
    setError('');
    setResult(null);

    try {
      const res = await fetch('/api/short-form', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, sourceName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Something went wrong.');
        setState('error');
        return;
      }
      setResult(data as ShortFormResult);
      setState('done');
    } catch {
      setError('Network error. Try again.');
      setState('error');
    }
  }

  return (
    <form onSubmit={handleAnalyze} className="flex flex-col gap-3">
      <label className="text-sm font-medium text-ink-muted">
        Paste a short-form video URL
      </label>
      <input
        type="url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://www.tiktok.com/@creator/video/…"
        disabled={state === 'loading'}
        className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-ink-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
      />
      <input
        type="text"
        value={sourceName}
        onChange={(e) => setSourceName(e.target.value)}
        placeholder="Creator / account name (optional)"
        disabled={state === 'loading'}
        className="w-full rounded-lg border border-line bg-surface px-4 py-3 text-base text-ink placeholder:text-ink-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
      />
      <p className="text-xs text-ink-muted">
        Supports: {PLATFORM_LABELS.join(' · ')}
      </p>

      <div className="flex items-center justify-between gap-3 text-sm">
        {state === 'loading' ? (
          <span className="text-xs text-ink-muted">
            Downloading audio → transcribing → detecting bias. Usually 15–30 s.
          </span>
        ) : (
          <span />
        )}
        <button
          type="submit"
          disabled={!url.trim() || state === 'loading'}
          className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {state === 'loading' ? 'Processing…' : 'Analyze video'}
        </button>
      </div>

      {state === 'error' && (
        <p role="alert" className="rounded-md border border-lean-right/30 bg-lean-right/5 px-3 py-2 text-sm text-lean-far-right">
          {error}
        </p>
      )}

      {state === 'done' && result && (
        <div className="mt-2 space-y-4">
          <div className="rounded-xl border border-line bg-surface p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Classifier result</span>
              <span className={`text-sm font-semibold ${result.bias.label === 'biased' ? 'text-lean-far-right' : 'text-green-600'}`}>
                {result.bias.label === 'biased' ? 'Biased' : 'Non-biased'} · {Math.round(result.bias.score * 100)}%
              </span>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs text-ink-muted w-32 shrink-0">Emotional intensity</span>
              <div className="flex-1 h-1.5 bg-line rounded-full">
                <div
                  className="h-full bg-amber-400 rounded-full transition-all"
                  style={{ width: `${result.bias.emotional_intensity * 100}%` }}
                />
              </div>
              <span className="text-xs text-ink-muted w-8 text-right">
                {Math.round(result.bias.emotional_intensity * 100)}%
              </span>
            </div>

            {result.bias.top_phrases.length > 0 && (
              <div>
                <p className="text-xs text-ink-muted mb-1.5">Charged phrases</p>
                <div className="flex flex-wrap gap-1.5">
                  {result.bias.top_phrases.map((p) => (
                    <span key={p} className="rounded-full bg-lean-right/10 px-2 py-0.5 text-xs text-lean-far-right">
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-line bg-surface p-5">
            <p className="text-xs text-ink-muted mb-2">
              Transcript · {result.duration_seconds}s · {result.language.toUpperCase()}
            </p>
            <p className="text-sm leading-relaxed text-ink">{result.transcript}</p>
          </div>
        </div>
      )}
    </form>
  );
}
