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
  result: Omit<AnalyzeResponse, 'id' | 'cached' | 'createdAt'>;
  embedding: unknown;
  bias_score: number;
  leaning: string;
  model: string;
  hf_score: number | null;
  hf_label: string | null;
  content_type: string;
  input_url: string | null;
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
  hf_score?: number | null;
  hf_label?: string | null;
  content_type?: string;
  input_url?: string | null;
};

export type UserAnalysisRow = {
  id: string;
  user_id: string;
  analysis_id: string;
  share_slug: string;
  created_at: string;
};

export const USER_ANALYSES_TABLE = 'user_analyses' as const;

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
