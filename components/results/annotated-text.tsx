'use client';

import { useMemo, useState } from 'react';
import type { Entity, LoadedPhrase, SentenceSentiment } from '@/types/biaslens';
import {
  ENTITY_CHIP_CLASS,
  buildAnnotations,
  flattenSegments,
  type AnnotatedSegment,
  type Annotation,
} from '@/lib/results/annotate';

const COLLAPSED_MAX_HEIGHT_PX = 480;

type AnnotatedTextProps = {
  text: string;
  loadedPhrases: LoadedPhrase[];
  perSentence: SentenceSentiment[];
  entities: Entity[];
  truncated?: boolean;
};

function classesFor(annotations: Annotation[]): { className: string; title?: string } {
  const classes: string[] = [];
  let title: string | undefined;

  const loaded = annotations.find((a) => a.kind === 'loaded');
  const flagged = annotations.find((a) => a.kind === 'flagged');
  const entity = annotations.find((a) => a.kind === 'entity');

  if (loaded) {
    classes.push(
      'bg-loaded-bg/70 decoration-loaded-edge underline decoration-dotted underline-offset-2 cursor-help',
    );
    title = loaded.reason;
  }
  if (flagged && !loaded) {
    classes.push('bg-lean-right/10');
  }
  if (entity) {
    classes.push('rounded-sm px-0.5 ring-1', ENTITY_CHIP_CLASS[entity.entityType]);
  }

  return { className: classes.join(' '), title };
}

function renderSegment(segment: AnnotatedSegment, idx: number) {
  if (segment.annotations.length === 0) {
    return <span key={idx}>{segment.text}</span>;
  }
  const { className, title } = classesFor(segment.annotations);
  return (
    <span key={idx} className={className} title={title}>
      {segment.text}
    </span>
  );
}

export function AnnotatedText({
  text,
  loadedPhrases,
  perSentence,
  entities,
  truncated,
}: AnnotatedTextProps) {
  const [expanded, setExpanded] = useState(false);

  const segments = useMemo(() => {
    const annotations = buildAnnotations(text, loadedPhrases, perSentence, entities);
    return flattenSegments(text, annotations);
  }, [text, loadedPhrases, perSentence, entities]);

  return (
    <section className="rounded-xl border border-line bg-surface p-6 sm:p-8">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold text-ink">Annotated text</h3>
        <Legend />
      </div>

      {truncated && (
        <p className="mt-3 rounded-md border border-loaded-edge/30 bg-loaded-bg/40 px-3 py-2 text-xs text-ink/80">
          Truncated to 50,000 characters before analysis. The remainder of the article was not scored.
        </p>
      )}

      <div className="relative mt-4">
        <div
          className="overflow-hidden whitespace-pre-wrap break-words font-serif text-base leading-relaxed text-ink"
          style={{ maxHeight: expanded ? 'none' : `${COLLAPSED_MAX_HEIGHT_PX}px` }}
        >
          {segments.map(renderSegment)}
        </div>
        {!expanded && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-surface to-transparent"
          />
        )}
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-4 rounded-md border border-line px-3 py-1.5 text-sm font-medium text-ink hover:bg-canvas"
      >
        {expanded ? 'Collapse' : 'Expand full text'}
      </button>
    </section>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-ink-muted">
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-sm bg-loaded-bg/70 underline decoration-loaded-edge decoration-dotted underline-offset-2" />
        loaded phrase
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-sm bg-lean-right/10" />
        charged term
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-block h-3 w-4 rounded-sm bg-violet-100 ring-1 ring-violet-200" />
        entity
      </span>
    </div>
  );
}
