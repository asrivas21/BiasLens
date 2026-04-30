import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/config/env';
import type { AnalyzeResponse } from '@/types/biaslens';

// Row shape for `public.analyses`. Mirrors the migration; kept in lockstep
// manually rather than generated to avoid the supabase-gen-types toolchain.
export type AnalysisRow = {
  id: string;
  input_hash: string;
  input_text: string;
  // The cached result is the AnalyzeResponse minus the per-request fields
  // (id/cached/createdAt) that the route layer re-stamps on every response.
  result: Omit<AnalyzeResponse, 'id' | 'cached' | 'createdAt'>;
  // pgvector returns the embedding as a JSON-encoded array string by default.
  // We never read it back into JS — it's only used inside SQL for ANN — so the
  // application type is `unknown`. Inserts pass `number[]` and supabase-js
  // serializes correctly.
  embedding: unknown;
  bias_score: number;
  leaning: string;
  model: string;
  created_at: string;
};

export type AnalysisInsert = {
  input_hash: string;
  input_text: string;
  result: AnalysisRow['result'];
  embedding: number[];
  bias_score: number;
  leaning: string;
  model: string;
};

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (!client) {
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}

export const ANALYSES_TABLE = 'analyses' as const;
