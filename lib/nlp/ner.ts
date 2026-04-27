import 'server-only';
import nlp from 'compromise';
import type { ItemEntity } from 'wink-nlp';
import { getWinkNlp } from '@/lib/nlp/wink';
import type { Entity, EntityType } from '@/types/biaslens';

// Trailing punctuation that compromise sometimes folds into an entity span.
const TRAILING_PUNCT_RE = /[\s.,;:!?'"\-)\]]+$/;
const LEADING_PUNCT_RE = /^[\s.,;:!?'"\-(\[]+/;

// wink-eng-lite-web-model NER emits a fixed set of regex/FSM-detected types.
// We surface the ones useful for bias framing (numeric/temporal authority signals)
// and let compromise handle PERSON / ORG / GPE.
const WINK_TYPE_MAP: Readonly<Record<string, EntityType>> = {
  MONEY: 'MONEY',
  DATE: 'DATE',
  TIME: 'TIME',
  PERCENT: 'PERCENT',
  CARDINAL: 'CARDINAL',
};

type CompromiseMatch = {
  text?: string;
  offset?: { start?: number; length?: number };
};

function pushFromCompromise(
  out: Entity[],
  text: string,
  matches: unknown,
  type: EntityType,
): void {
  if (!Array.isArray(matches)) return;
  for (const raw of matches as CompromiseMatch[]) {
    const rawStart = raw?.offset?.start;
    const length = raw?.offset?.length;
    if (typeof rawStart !== 'number' || typeof length !== 'number' || length <= 0) continue;
    const rawEnd = rawStart + length;
    if (rawStart < 0 || rawEnd > text.length) continue;
    const slice = text.slice(rawStart, rawEnd);
    const lead = slice.match(LEADING_PUNCT_RE)?.[0].length ?? 0;
    const trail = slice.match(TRAILING_PUNCT_RE)?.[0].length ?? 0;
    const start = rawStart + lead;
    const end = rawEnd - trail;
    if (end <= start) continue;
    out.push({ text: text.slice(start, end), type, start, end });
  }
}

function pushFromWink(out: Entity[], text: string): void {
  const winkInstance = getWinkNlp();
  const its = winkInstance.its;
  const doc = winkInstance.readDoc(text);
  // Track per-value cursor so repeated mentions get distinct character offsets.
  const cursors = new Map<string, number>();
  doc.entities().each((ent: ItemEntity) => {
    const detail = ent.out(its.detail) as { value: string; type: string } | string;
    if (typeof detail !== 'object' || detail === null) return;
    const mapped = WINK_TYPE_MAP[detail.type];
    if (!mapped) return;
    const value = detail.value;
    if (!value) return;
    const fromIndex = cursors.get(value) ?? 0;
    const start = text.indexOf(value, fromIndex);
    if (start === -1) return;
    const end = start + value.length;
    cursors.set(value, end);
    out.push({ text: value, type: mapped, start, end });
  });
}

function overlaps(a: Entity, b: Entity): boolean {
  return a.start < b.end && b.start < a.end;
}

// Compromise PERSON/ORG/GPE entities are appended first and therefore win on
// overlap with wink CARDINAL/DATE/etc. — political entities are higher-signal
// for bias analysis than incidental numbers/dates that may share a span.
function dedupeAndSort(entities: Entity[]): Entity[] {
  const sorted = [...entities].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    // Longer span wins at same start (more specific phrase).
    return b.end - a.end;
  });
  const kept: Entity[] = [];
  for (const ent of sorted) {
    if (kept.some((k) => overlaps(k, ent))) continue;
    kept.push(ent);
  }
  return kept;
}

export function extractEntities(text: string): Entity[] {
  if (text.trim().length === 0) return [];

  const collected: Entity[] = [];
  const cdoc = nlp(text);
  pushFromCompromise(collected, text, cdoc.people().json({ offset: true }), 'PERSON');
  pushFromCompromise(collected, text, cdoc.organizations().json({ offset: true }), 'ORG');
  pushFromCompromise(collected, text, cdoc.places().json({ offset: true }), 'GPE');
  pushFromWink(collected, text);

  return dedupeAndSort(collected);
}
