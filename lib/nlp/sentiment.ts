import 'server-only';
import sentiment from 'wink-sentiment';
import { getWinkNlp } from '@/lib/nlp/wink';
import type { SentenceSentiment } from '@/types/biaslens';

const AFINN_MAX_ABS = 5;

export type SentimentAnalysis = {
  overall: number;
  perSentence: SentenceSentiment[];
};

function clampUnit(value: number): number {
  if (value > 1) return 1;
  if (value < -1) return -1;
  return value;
}

function normalize(rawNormalizedScore: number): number {
  return Number(clampUnit(rawNormalizedScore / AFINN_MAX_ABS).toFixed(4));
}

function extractFlaggedTerms(
  tokens: ReturnType<typeof sentiment>['tokenizedPhrase'],
): string[] {
  if (!tokens) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const tkn of tokens) {
    if (tkn.tag !== 'word') continue;
    if (typeof tkn.score !== 'number' || tkn.score === 0) continue;
    const key = tkn.value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

type LocatedSentence = { text: string; start: number; end: number };

// Walk a per-sentence cursor through the original text so repeated sentences
// (rare in news prose, but real) get distinct, non-overlapping spans.
function locateSentences(text: string): LocatedSentence[] {
  const nlp = getWinkNlp();
  const raw = nlp.readDoc(text).sentences().out() as string[];
  const out: LocatedSentence[] = [];
  let cursor = 0;
  for (const sent of raw) {
    const trimmed = sent.trim();
    if (trimmed.length === 0) continue;
    const start = text.indexOf(trimmed, cursor);
    if (start === -1) continue;
    const end = start + trimmed.length;
    cursor = end;
    out.push({ text: trimmed, start, end });
  }
  return out;
}

export function analyzeSentiment(text: string): SentimentAnalysis {
  if (text.trim().length === 0) {
    return { overall: 0, perSentence: [] };
  }
  const overallResult = sentiment(text);
  const overall = normalize(overallResult.normalizedScore);

  const perSentence: SentenceSentiment[] = locateSentences(text).map((sent) => {
    const result = sentiment(sent.text);
    return {
      text: sent.text,
      score: normalize(result.normalizedScore),
      flaggedTerms: extractFlaggedTerms(result.tokenizedPhrase),
      start: sent.start,
      end: sent.end,
    };
  });

  return { overall, perSentence };
}
