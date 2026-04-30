'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { analyzeText, analyzeUrl, ApiClientError } from '@/lib/client/api';
import { MAX_TEXT_LENGTH, MIN_TEXT_LENGTH } from '@/lib/api/limits';

// Single-line http(s) URL with no internal whitespace. Auto-switches the form
// into URL mode so the user can paste a link without an explicit toggle.
const URL_PATTERN = /^https?:\/\/[^\s]+$/i;

function detectUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!URL_PATTERN.test(trimmed)) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function AnalyzeForm() {
  const router = useRouter();
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const detectedUrl = useMemo(() => detectUrl(text), [text]);
  const isUrlMode = detectedUrl !== null;

  const trimmedLength = text.trim().length;
  const tooShort = !isUrlMode && trimmedLength > 0 && trimmedLength < MIN_TEXT_LENGTH;
  const tooLong = !isUrlMode && trimmedLength > MAX_TEXT_LENGTH;
  const canSubmit =
    !submitting && (isUrlMode || (trimmedLength >= MIN_TEXT_LENGTH && !tooLong));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = isUrlMode && detectedUrl
        ? await analyzeUrl(detectedUrl)
        : await analyzeText(text);
      router.push(`/results/${result.id}`);
    } catch (err) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Something went wrong. Please try again.';
      setError(message);
      setSubmitting(false);
    }
  }

  const counterClass = tooLong
    ? 'text-lean-far-right'
    : tooShort
      ? 'text-lean-right'
      : 'text-ink-muted';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" aria-busy={submitting}>
      <label htmlFor="analyze-input" className="sr-only">
        Text or article URL to analyze
      </label>
      <textarea
        id="analyze-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a passage of news writing or commentary, or a link to an article…"
        rows={10}
        disabled={submitting}
        spellCheck={!isUrlMode}
        className="w-full resize-y rounded-lg border border-line bg-surface px-4 py-3 text-base leading-relaxed text-ink placeholder:text-ink-muted/70 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
      />
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className={isUrlMode ? 'text-accent' : counterClass}>
          {isUrlMode
            ? "URL detected — we'll fetch and analyze the article."
            : tooShort
              ? `${MIN_TEXT_LENGTH - trimmedLength} more character${MIN_TEXT_LENGTH - trimmedLength === 1 ? '' : 's'} required`
              : tooLong
                ? `${trimmedLength - MAX_TEXT_LENGTH} characters over the ${MAX_TEXT_LENGTH.toLocaleString()} limit`
                : `${trimmedLength.toLocaleString()} / ${MAX_TEXT_LENGTH.toLocaleString()} characters`}
        </span>
        <button
          type="submit"
          disabled={!canSubmit}
          className="rounded-md bg-accent px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting ? (isUrlMode ? 'Fetching…' : 'Analyzing…') : 'Analyze'}
        </button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-md border border-lean-right/30 bg-lean-right/5 px-3 py-2 text-sm text-lean-far-right"
        >
          {error}
        </p>
      )}
    </form>
  );
}
