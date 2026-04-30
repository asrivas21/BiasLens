import 'server-only';
import { ANALYSES_TABLE, getSupabase, type AnalysisInsert } from '@/lib/supabase';
import { logger } from '@/lib/observability/logger';

// Insert a freshly-computed analysis. Uses upsert on the (input_hash, model)
// unique index so simultaneous misses on the same text don't 23505 on the
// second insert — whichever request lands second is silently treated as a
// duplicate, the row already written by the first request stays put.
export async function writeAnalysis(insert: AnalysisInsert): Promise<string | null> {
  const supabase = getSupabase();
  const startedAt = Date.now();
  const { data, error } = await supabase
    .from(ANALYSES_TABLE)
    .upsert(insert, { onConflict: 'input_hash,model', ignoreDuplicates: true })
    .select('id')
    .maybeSingle();

  if (error) {
    logger.error('cache_write_failed', {
      durationMs: Date.now() - startedAt,
      message: error.message,
    });
    return null;
  }

  const id = data?.id ?? null;
  logger.info('cache_write', {
    durationMs: Date.now() - startedAt,
    inserted: id !== null,
  });
  return id;
}
