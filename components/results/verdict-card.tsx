import type { AnalysisSource, HfResult, Leaning } from '@/types/biaslens';
import { BiasScale } from './bias-scale';

type VerdictCardProps = {
  leaning: Leaning;
  biasScore: number;
  agreement: string;
  hf?: HfResult;
  source?: AnalysisSource;
};

const LEANING_LABEL: Record<Leaning, string> = {
  'far-left': 'Far left',
  left: 'Left',
  center: 'Center',
  right: 'Right',
  'far-right': 'Far right',
};

const LEANING_COLOR: Record<Leaning, string> = {
  'far-left': 'text-lean-far-left',
  left: 'text-lean-left',
  center: 'text-lean-center',
  right: 'text-lean-right',
  'far-right': 'text-lean-far-right',
};

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function VerdictCard({ leaning, biasScore, agreement, hf, source }: VerdictCardProps) {
  return (
    <section className="rounded-xl border border-line bg-surface p-6 sm:p-8">
      <p className="text-xs font-medium uppercase tracking-widest text-ink-muted">
        Estimated leaning
      </p>
      <h2 className={`mt-1 text-4xl font-semibold tracking-tight ${LEANING_COLOR[leaning]}`}>
        {LEANING_LABEL[leaning]}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        bias score {biasScore.toFixed(2)} · cross-signal agreement {agreement}
      </p>

      {hf && (
        <div className="mt-3 flex items-center gap-3 text-sm">
          <span className="text-xs font-medium uppercase tracking-widest text-ink-muted">
            Classifier
          </span>
          <span className={`font-medium ${hf.label === 'biased' ? 'text-lean-far-right' : 'text-green-600'}`}>
            {hf.label === 'biased' ? 'Biased' : 'Non-biased'} · {Math.round(hf.score * 100)}% confidence
          </span>
        </div>
      )}

      <div className="mt-6">
        <BiasScale biasScore={biasScore} />
      </div>

      {source?.type === 'url' && (
        <div className="mt-6 border-t border-line pt-4 text-sm">
          <p className="text-xs font-medium uppercase tracking-widest text-ink-muted">
            Source
          </p>
          <a
            href={source.url}
            target="_blank"
            rel="noreferrer noopener"
            className="mt-1 inline-flex items-center gap-1 text-accent hover:underline"
          >
            {source.siteName ?? hostnameOf(source.url)}
            <span aria-hidden>↗</span>
          </a>
          {source.title && (
            <p className="mt-1 text-ink/90">{source.title}</p>
          )}
        </div>
      )}
    </section>
  );
}
