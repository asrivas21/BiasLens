import 'server-only';
import { getSupabase } from '@/lib/supabase';
import { logger } from '@/lib/observability/logger';
import { CACHE_TTL_DAYS } from '@/lib/cache/exact';
import type { AnalyzeResponse } from '@/types/biaslens';

// Cosine-similarity threshold above which a prior analysis is considered a
// reusable paraphrase. Tuned from probe-similarity.mjs measurements on
// `text-embedding-3-small`: aggressive paraphrases of the same article cluster
// around 0.92+, while same-topic / opposite-framing pairs sit around 0.73.
// 0.86 leaves ~13pts of margin above the different-take ceiling (so we don't
// reuse a left-leaning analysis for a right-leaning take) and ~6pts below
// the paraphrase floor.
export const SEMANTIC_CACHE_THRESHOLD = 0.86;

export type SemanticCacheHit = {
  id: string;
  input_text: string;
  result: Omit<AnalyzeResponse, 'id' | 'cached' | 'createdAt'>;
  bias_score: number;
  leaning: string;
  model: string;
  created_at: string;
  similarity: number;
};

function ttlCutoffIso(): string {
  const cutoff = Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  return new Date(cutoff).toISOString();
}

export async function lookupSemanticCache(
  embedding: number[],
  model: string,
  threshold: number = SEMANTIC_CACHE_THRESHOLD,
): Promise<SemanticCacheHit | null> {
  const supabase = getSupabase();
  const startedAt = Date.now();
  const { data, error } = await supabase.rpc('match_analysis', {
    query_embedding: embedding,
    match_model: model,
    match_threshold: threshold,
    match_cutoff: ttlCutoffIso(),
  });

  if (error) {
    logger.error('cache_semantic_lookup_failed', {
      durationMs: Date.now() - startedAt,
      message: error.message,
    });
    return null;
  }

  const rows = (data ?? []) as SemanticCacheHit[];
  const hit = rows[0] ?? null;
  logger.info('cache_semantic_lookup', {
    durationMs: Date.now() - startedAt,
    threshold,
    hit: hit !== null,
    similarity: hit?.similarity,
  });
  return hit;
}
