import type { AnalyzeResponse } from '@/types/biaslens';

type StatStripProps = {
  analysis: AnalyzeResponse;
};

type Stat = {
  label: string;
  value: string;
  hint: string;
};

function buildStats(analysis: AnalyzeResponse): Stat[] {
  const loadedCount = analysis.llm.loadedLanguage.length;
  const flaggedCount = analysis.nlp.sentiment.perSentence.reduce(
    (sum, s) => sum + s.flaggedTerms.length,
    0,
  );
  const sentences = analysis.nlp.sentiment.perSentence;
  const negativeCount = sentences.filter((s) => s.score < 0).length;
  const negativePct =
    sentences.length === 0 ? 0 : Math.round((negativeCount / sentences.length) * 100);
  const entityCount = analysis.nlp.entities.length;
  const uniqueEntities = new Set(
    analysis.nlp.entities.map((e) => `${e.type}::${e.text.toLowerCase()}`),
  ).size;

  return [
    {
      label: 'Loaded phrases',
      value: loadedCount.toLocaleString(),
      hint: 'flagged by the LLM',
    },
    {
      label: 'Charged terms',
      value: flaggedCount.toLocaleString(),
      hint: 'sentiment-bearing words',
    },
    {
      label: 'Negative sentences',
      value: `${negativePct}%`,
      hint: `${negativeCount} of ${sentences.length}`,
    },
    {
      label: 'Entities',
      value: uniqueEntities.toLocaleString(),
      hint: `${entityCount} mention${entityCount === 1 ? '' : 's'}`,
    },
  ];
}

export function StatStrip({ analysis }: StatStripProps) {
  const stats = buildStats(analysis);
  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="rounded-lg border border-line bg-surface p-4"
        >
          <p className="text-[11px] font-medium uppercase tracking-widest text-ink-muted">
            {stat.label}
          </p>
          <p className="mt-1 text-2xl font-semibold text-ink">{stat.value}</p>
          <p className="mt-1 text-xs text-ink-muted">{stat.hint}</p>
        </div>
      ))}
    </section>
  );
}
