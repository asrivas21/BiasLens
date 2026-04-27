import 'server-only';
import type {
  Entity,
  EntitySignal,
  LlmAnalysis,
  NlpAnalysis,
  SentenceSentiment,
  SignalAgreement,
  Signals,
} from '@/types/biaslens';

// Saturation thresholds for chargedLanguageScore components. Picked so that a
// strongly-charged op-ed (sentiment magnitude ~0.5, ~4 loaded phrases, ~10
// flagged terms) lands near 1.0 and a neutral wire report lands near 0.0.
const LOADED_PHRASE_SATURATION = 4;
const FLAGGED_TERM_SATURATION = 10;
const W_SENTIMENT = 0.4;
const W_LOADED = 0.4;
const W_FLAGGED = 0.2;

// Cross-layer agreement thresholds.
const LLM_FLAG_THRESHOLD = 2;             // >= 2 loaded phrases = LLM signalled
const NLP_STRONG_THRESHOLD = 0.3;         // |overall sentiment| >= 0.3 = NLP signalled
const NLP_FLAGGED_TERMS_THRESHOLD = 5;    // OR >= 5 flagged terms — partisan
                                          // text often pairs negative + positive
                                          // words that cancel in the signed
                                          // average, so quantity is a more
                                          // reliable "charged language" signal.

function clampUnit(value: number): number {
  if (value > 1) return 1;
  if (value < 0) return 0;
  return value;
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function computeChargedLanguageScore(nlp: NlpAnalysis, llm: LlmAnalysis): number {
  const sentMag = Math.abs(nlp.sentiment.overall);
  const loadedDensity = clampUnit(llm.loadedLanguage.length / LOADED_PHRASE_SATURATION);
  const flaggedTotal = nlp.sentiment.perSentence.reduce(
    (sum, s) => sum + s.flaggedTerms.length,
    0,
  );
  const flaggedDensity = clampUnit(flaggedTotal / FLAGGED_TERM_SATURATION);
  const raw = W_SENTIMENT * sentMag + W_LOADED * loadedDensity + W_FLAGGED * flaggedDensity;
  return Number(clampUnit(raw).toFixed(4));
}

function computeAgreement(nlp: NlpAnalysis, llm: LlmAnalysis): SignalAgreement {
  const llmFlagged = llm.loadedLanguage.length >= LLM_FLAG_THRESHOLD;
  const flaggedTotal = nlp.sentiment.perSentence.reduce(
    (sum, s) => sum + s.flaggedTerms.length,
    0,
  );
  const nlpStrong =
    Math.abs(nlp.sentiment.overall) >= NLP_STRONG_THRESHOLD ||
    flaggedTotal >= NLP_FLAGGED_TERMS_THRESHOLD;
  if (llmFlagged && nlpStrong) return 'aligned';
  if (llmFlagged) return 'llm-only';
  if (nlpStrong) return 'nlp-only';
  return 'neutral';
}

// Group entity occurrences by case-insensitive surface text + type. The same
// person may be extracted multiple times ("Trump", "Trump", "Donald Trump") —
// we keep the longest surface as the canonical label and aggregate spans.
type EntityGroup = { label: string; type: Entity['type']; spans: Array<{ start: number; end: number }> };

function groupEntities(entities: Entity[]): EntityGroup[] {
  const byKey = new Map<string, EntityGroup>();
  for (const ent of entities) {
    const key = `${ent.type}::${ent.text.toLowerCase()}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.spans.push({ start: ent.start, end: ent.end });
      if (ent.text.length > existing.label.length) existing.label = ent.text;
    } else {
      byKey.set(key, { label: ent.text, type: ent.type, spans: [{ start: ent.start, end: ent.end }] });
    }
  }
  return [...byKey.values()];
}

function sentencesContaining(
  spans: Array<{ start: number; end: number }>,
  perSentence: SentenceSentiment[],
): SentenceSentiment[] {
  const hits = new Set<SentenceSentiment>();
  for (const span of spans) {
    for (const sent of perSentence) {
      if (sent.start <= span.start && span.end <= sent.end) hits.add(sent);
    }
  }
  return [...hits];
}

function computeEntitySentiment(nlp: NlpAnalysis, llm: LlmAnalysis): EntitySignal[] {
  const groups = groupEntities(nlp.entities);
  const normalizedLoaded = llm.loadedLanguage.map((p) => ({
    original: p.phrase,
    normalized: normalizeForMatch(p.phrase),
  }));

  const out: EntitySignal[] = [];
  for (const group of groups) {
    const sents = sentencesContaining(group.spans, nlp.sentiment.perSentence);
    if (sents.length === 0) continue;

    const avgSentiment = Number(
      (sents.reduce((sum, s) => sum + s.score, 0) / sents.length).toFixed(4),
    );

    const sentenceBlob = normalizeForMatch(sents.map((s) => s.text).join(' '));
    const loadedNearby: string[] = [];
    const seenLoaded = new Set<string>();
    for (const phrase of normalizedLoaded) {
      if (!sentenceBlob.includes(phrase.normalized)) continue;
      if (seenLoaded.has(phrase.normalized)) continue;
      seenLoaded.add(phrase.normalized);
      loadedNearby.push(phrase.original);
    }

    const flaggedSet = new Set<string>();
    for (const s of sents) for (const t of s.flaggedTerms) flaggedSet.add(t);

    out.push({
      entity: group.label,
      type: group.type,
      mentions: sents.length,
      avgSentiment,
      loadedPhrasesNearby: loadedNearby,
      flaggedTermsNearby: [...flaggedSet],
    });
  }

  // Most-charged entities first (by sentiment magnitude), ties broken by mention count.
  out.sort((a, b) => {
    const magDiff = Math.abs(b.avgSentiment) - Math.abs(a.avgSentiment);
    if (magDiff !== 0) return magDiff;
    return b.mentions - a.mentions;
  });
  return out;
}

export function computeSignals(nlp: NlpAnalysis, llm: LlmAnalysis): Signals {
  return {
    biasScore: llm.biasScore,
    leaning: llm.leaning,
    chargedLanguageScore: computeChargedLanguageScore(nlp, llm),
    entitySentiment: computeEntitySentiment(nlp, llm),
    agreement: computeAgreement(nlp, llm),
  };
}
