import 'server-only';
import { ANALYSES_TABLE, getSupabase, type AnalysisRow } from '@/lib/supabase';
import { logger } from '@/lib/observability/logger';
import type { AnalyzeResponse } from '@/types/biaslens';

// Look up a stored analysis by primary key. Used by the results page and the
// future GET /api/analyses/[id] endpoint. Returns the full AnalyzeResponse
// shape with `cached: true` so the rendering layer doesn't need to know it
// came from storage vs. a fresh pipeline run.
export async function getAnalysisById(id: string): Promise<AnalyzeResponse | null> {
  const supabase = getSupabase();
  const startedAt = Date.now();
  const { data, error } = await supabase
    .from(ANALYSES_TABLE)
    .select('id, result, created_at')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    logger.error('analysis_read_failed', {
      durationMs: Date.now() - startedAt,
      id,
      message: error.message,
    });
    return null;
  }

  if (!data) {
    logger.info('analysis_read_miss', { id, durationMs: Date.now() - startedAt });
    return null;
  }

  const row = data as Pick<AnalysisRow, 'id' | 'result' | 'created_at'>;
  return {
    ...row.result,
    id: row.id,
    cached: true,
    createdAt: row.created_at,
  };
}
