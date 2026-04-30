import type { EntitySignal } from '@/types/biaslens';
import { ENTITY_CHIP_CLASS, ENTITY_LABEL } from '@/lib/results/annotate';

type EntityStripProps = {
  entities: EntitySignal[];
};

function sentimentLabel(score: number): { text: string; tone: string } {
  const mag = Math.abs(score);
  if (mag < 0.1) return { text: 'neutral', tone: 'text-ink-muted' };
  if (score < 0) {
    return mag > 0.4
      ? { text: 'strongly negative', tone: 'text-lean-far-right' }
      : { text: 'negative', tone: 'text-lean-right' };
  }
  return mag > 0.4
    ? { text: 'strongly positive', tone: 'text-accent' }
    : { text: 'positive', tone: 'text-accent/80' };
}

export function EntityStrip({ entities }: EntityStripProps) {
  if (entities.length === 0) return null;
  const top = entities.slice(0, 8);
  return (
    <section className="rounded-xl border border-line bg-surface p-6 sm:p-8">
      <h3 className="text-lg font-semibold text-ink">Entity sentiment</h3>
      <p className="mt-1 text-sm text-ink-muted">
        Average sentiment of sentences mentioning each entity, ordered by intensity.
      </p>
      <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {top.map((entity) => {
          const sentiment = sentimentLabel(entity.avgSentiment);
          return (
            <li
              key={`${entity.type}-${entity.entity}`}
              className="rounded-lg border border-line p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${ENTITY_CHIP_CLASS[entity.type]}`}
                >
                  {ENTITY_LABEL[entity.type]}
                </span>
                <span className="text-xs text-ink-muted">
                  {entity.mentions} mention{entity.mentions === 1 ? '' : 's'}
                </span>
              </div>
              <p className="mt-2 truncate text-base font-medium text-ink">{entity.entity}</p>
              <p className={`mt-1 text-xs ${sentiment.tone}`}>
                {sentiment.text} ({entity.avgSentiment.toFixed(2)})
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
