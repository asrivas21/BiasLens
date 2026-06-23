'use client';

import { useEffect, useState } from 'react';
import { AnalyzeForm } from './analyze-form';
import { ShortFormAnalyzer } from './short-form-analyzer';

type Tab = 'article' | 'short-form';

export function TabView() {
  const [tab, setTab] = useState<Tab>('article');

  // Warm up the FastAPI service on mount so it's ready when the user submits.
  useEffect(() => {
    fetch('/api/ping').catch(() => null);
  }, []);

  return (
    <div>
      <div role="tablist" className="mb-6 flex gap-1 rounded-lg border border-line bg-surface p-1 w-fit">
        {(['article', 'short-form'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-md px-4 py-1.5 text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-accent text-white'
                : 'text-ink-muted hover:text-ink'
            }`}
          >
            {t === 'article' ? 'Article / text' : 'Short-form video'}
          </button>
        ))}
      </div>

      {tab === 'article' ? <AnalyzeForm /> : <ShortFormAnalyzer />}
    </div>
  );
}
