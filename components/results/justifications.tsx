import type { LlmAnalysis } from '@/types/biaslens';

type JustificationsProps = {
  llm: LlmAnalysis;
};

export function Justifications({ llm }: JustificationsProps) {
  return (
    <section className="rounded-xl border border-line bg-surface p-6 sm:p-8">
      <h3 className="text-lg font-semibold text-ink">Why this leaning</h3>
      <p className="mt-3 text-base leading-relaxed text-ink/90">{llm.explanation}</p>

      <div className="mt-6 border-t border-line pt-4">
        <p className="text-xs font-medium uppercase tracking-widest text-ink-muted">
          Framing
        </p>
        <p className="mt-2 text-sm leading-relaxed text-ink/80">{llm.framing}</p>
      </div>

      {llm.loadedLanguage.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <p className="text-xs font-medium uppercase tracking-widest text-ink-muted">
            Loaded phrases ({llm.loadedLanguage.length})
          </p>
          <ul className="mt-3 space-y-3">
            {llm.loadedLanguage.map((phrase, idx) => (
              <li key={`${phrase.phrase}-${idx}`} className="text-sm">
                <span className="rounded-sm bg-loaded-bg px-1 py-0.5 font-medium text-ink decoration-loaded-edge underline decoration-dotted underline-offset-2">
                  {phrase.phrase}
                </span>
                <span className="ml-2 text-ink-muted">{phrase.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
