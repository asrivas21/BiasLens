import 'server-only';
import { createHash } from 'node:crypto';
import { ANALYSES_TABLE, getSupabase, type AnalysisRow } from '@/lib/supabase';
import { logger } from '@/lib/observability/logger';

// Cache freshness window — analyses older than this are ignored on lookup.
// News framing drifts; 90 days keeps the cache useful without serving stale
// context. Combined with the model column on the row, model upgrades also
// invalidate the cache without any code change here.
export const CACHE_TTL_DAYS = 90;

// Normalize input before hashing so trivial whitespace / unicode differences
// don't blow the cache. We deliberately do NOT lowercase: case carries
// meaning in proper-noun-heavy news prose.
export function normalizeForHash(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

export function hashInput(text: string): string {
  return createHash('sha256').update(normalizeForHash(text)).digest('hex');
}

function ttlCutoffIso(): string {
  const cutoff = Date.now() - CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
  return new Date(cutoff).toISOString();
}

export async function lookupExactCache(
  inputHash: string,
  model: string,
): Promise<AnalysisRow | null> {
  const supabase = getSupabase();
  const startedAt = Date.now();
  const { data, error } = await supabase
    .from(ANALYSES_TABLE)
    .select('*')
    .eq('input_hash', inputHash)
    .eq('model', model)
    .gte('created_at', ttlCutoffIso())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    logger.error('cache_exact_lookup_failed', {
      durationMs: Date.now() - startedAt,
      message: error.message,
    });
    return null;
  }

  logger.info('cache_exact_lookup', {
    durationMs: Date.now() - startedAt,
    hit: data !== null,
  });
  return (data as AnalysisRow | null) ?? null;
}
