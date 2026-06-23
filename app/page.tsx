import { TabView } from '@/components/analyze/tab-view';

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
        Paste a news article, drop a URL, or link a short-form video. BiasLens
        combines a HuggingFace classifier, sentiment analysis, named-entity recognition,
        and a language model to surface loaded language, framing, and political leaning.
      </p>
      <div className="mt-10">
        <TabView />
      </div>
    </div>
  );
}
