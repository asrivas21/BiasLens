import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAnalysisById } from '@/lib/cache/read';
import { VerdictCard } from '@/components/results/verdict-card';
import { StatStrip } from '@/components/results/stat-strip';
import { AnnotatedText } from '@/components/results/annotated-text';
import { Justifications } from '@/components/results/justifications';
import { EntityStrip } from '@/components/results/entity-strip';

type ResultsPageProps = {
  params: Promise<{ id: string }>;
};

export default async function ResultsPage({ params }: ResultsPageProps) {
  const { id } = await params;
  const analysis = await getAnalysisById(id);
  if (!analysis) notFound();

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <Link href="/" className="text-sm text-accent hover:underline">
        ← New analysis
      </Link>

      <div className="mt-6 flex items-baseline justify-between gap-4">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Analysis</h1>
        <p className="font-mono text-xs text-ink-muted">{analysis.id.slice(0, 8)}</p>
      </div>

      <div className="mt-6 space-y-6">
        <VerdictCard
          leaning={analysis.llm.leaning}
          biasScore={analysis.llm.biasScore}
          agreement={analysis.signals.agreement}
          hf={analysis.hf}
          source={analysis.source}
        />

        <StatStrip analysis={analysis} />

        <AnnotatedText
          text={analysis.inputText}
          loadedPhrases={analysis.llm.loadedLanguage}
          perSentence={analysis.nlp.sentiment.perSentence}
          entities={analysis.nlp.entities}
          truncated={analysis.source?.truncated}
        />

        <Justifications llm={analysis.llm} />

        <EntityStrip entities={analysis.signals.entitySentiment} />
      </div>
    </div>
  );
}
