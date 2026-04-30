import type { Entity, LoadedPhrase, SentenceSentiment } from '@/types/biaslens';

// A single annotation overlay against a contiguous range of the source text.
// The renderer walks unique boundary points and applies whichever overlays
// cover each segment, so overlaps stack visually instead of being dropped.
export type Annotation =
  | { kind: 'loaded'; start: number; end: number; reason: string }
  | { kind: 'flagged'; start: number; end: number; term: string }
  | { kind: 'entity'; start: number; end: number; entityType: Entity['type']; text: string };

// One contiguous slice of text after annotations are flattened. Each segment
// carries every annotation that covers its range so the renderer can apply
// stacked styles without having to re-scan.
export type AnnotatedSegment = {
  text: string;
  start: number;
  end: number;
  annotations: Annotation[];
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findOccurrences(haystack: string, needle: string): Array<{ start: number; end: number }> {
  const trimmed = needle.trim();
  if (trimmed.length === 0) return [];
  const re = new RegExp(escapeRegex(trimmed), 'gi');
  const out: Array<{ start: number; end: number }> = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(haystack)) !== null) {
    out.push({ start: match.index, end: match.index + match[0].length });
    if (match.index === re.lastIndex) re.lastIndex += 1;
  }
  return out;
}

export function buildAnnotations(
  text: string,
  loadedPhrases: LoadedPhrase[],
  perSentence: SentenceSentiment[],
  entities: Entity[],
): Annotation[] {
  const out: Annotation[] = [];

  for (const phrase of loadedPhrases) {
    for (const occ of findOccurrences(text, phrase.phrase)) {
      out.push({ kind: 'loaded', start: occ.start, end: occ.end, reason: phrase.reason });
    }
  }

  // Flagged terms come from sentence-level sentiment; positions are scoped to
  // the sentence so we add the sentence offset to land them in the source.
  for (const sent of perSentence) {
    for (const term of sent.flaggedTerms) {
      for (const occ of findOccurrences(sent.text, term)) {
        out.push({
          kind: 'flagged',
          start: sent.start + occ.start,
          end: sent.start + occ.end,
          term,
        });
      }
    }
  }

  for (const ent of entities) {
    if (ent.start < 0 || ent.end > text.length || ent.end <= ent.start) continue;
    out.push({
      kind: 'entity',
      start: ent.start,
      end: ent.end,
      entityType: ent.type,
      text: ent.text,
    });
  }

  return out;
}

// Walk every unique boundary point and emit a segment for each [bN, bN+1)
// gap, attaching whichever annotations cover that range. Cost is O(B * A)
// where B is boundary count and A is annotation count — fine for typical
// articles (<100 annotations, <1k boundaries).
export function flattenSegments(text: string, annotations: Annotation[]): AnnotatedSegment[] {
  if (annotations.length === 0) {
    return [{ text, start: 0, end: text.length, annotations: [] }];
  }
  const boundaries = new Set<number>([0, text.length]);
  for (const ann of annotations) {
    if (ann.start >= 0 && ann.start <= text.length) boundaries.add(ann.start);
    if (ann.end >= 0 && ann.end <= text.length) boundaries.add(ann.end);
  }
  const sorted = [...boundaries].sort((a, b) => a - b);

  const segments: AnnotatedSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (start === end) continue;
    const covering = annotations.filter((ann) => ann.start <= start && ann.end >= end);
    segments.push({
      text: text.slice(start, end),
      start,
      end,
      annotations: covering,
    });
  }
  return segments;
}

// Tailwind classes for entity chips. Static map so the JIT keeps them in the
// generated stylesheet — do NOT switch to a template literal.
export const ENTITY_CHIP_CLASS: Record<Entity['type'], string> = {
  PERSON: 'bg-violet-100 text-violet-800 ring-violet-200',
  ORG: 'bg-amber-100 text-amber-900 ring-amber-200',
  GPE: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  MONEY: 'bg-teal-100 text-teal-800 ring-teal-200',
  DATE: 'bg-slate-100 text-slate-700 ring-slate-200',
  TIME: 'bg-slate-100 text-slate-700 ring-slate-200',
  PERCENT: 'bg-stone-100 text-stone-700 ring-stone-200',
  CARDINAL: 'bg-stone-100 text-stone-700 ring-stone-200',
  MISC: 'bg-gray-100 text-gray-700 ring-gray-200',
};

export const ENTITY_LABEL: Record<Entity['type'], string> = {
  PERSON: 'Person',
  ORG: 'Organization',
  GPE: 'Place',
  MONEY: 'Money',
  DATE: 'Date',
  TIME: 'Time',
  PERCENT: 'Percent',
  CARDINAL: 'Number',
  MISC: 'Misc',
};
