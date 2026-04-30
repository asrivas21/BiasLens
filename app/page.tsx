import { AnalyzeForm } from '@/components/analyze/analyze-form';

export default function Home() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-20">
      <p className="text-sm font-medium uppercase tracking-widest text-accent">
        Media bias analysis
      </p>
      <h1 className="mt-3 text-4xl font-semibold tracking-tight text-ink sm:text-5xl">
        Read between the lines.
      </h1>
      <p className="mt-4 max-w-xl text-lg leading-relaxed text-ink-muted">
        Paste a passage of news writing or commentary. BiasLens combines
        sentiment analysis, named-entity recognition, and a language model
        to surface loaded language, framing, and political leaning — without
        making any claim about whether the text is true.
      </p>
      <div className="mt-10">
        <AnalyzeForm />
      </div>
    </div>
  );
}
