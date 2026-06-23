import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/config/env';
import { getCurrentUser } from '@/lib/supabase-server-auth';
import { getSupabase, USER_ANALYSES_TABLE } from '@/lib/supabase';
import { writeAnalysis } from '@/lib/cache/write';
import { hashInput } from '@/lib/cache/exact';
import { generateEmbedding } from '@/lib/ai/embeddings';
import { nanoid } from 'nanoid';
import type { ShortFormResult } from '@/types/biaslens';

const SUPPORTED_PATTERNS = [
  /tiktok\.com/,
  /youtube\.com\/shorts/,
  /youtu\.be/,
  /instagram\.com\/reels/,
  /twitter\.com/,
  /x\.com/,
];

function isValidShortFormUrl(url: string): boolean {
  return SUPPORTED_PATTERNS.some((p) => p.test(url));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const { url, sourceName } = body as { url?: string; sourceName?: string };
  if (!url || !isValidShortFormUrl(url)) {
    return NextResponse.json(
      { error: 'Invalid or unsupported URL. Paste a TikTok, YouTube Short, Instagram Reel, or X video link.' },
      { status: 400 },
    );
  }

  let res: Response;
  try {
    res = await fetch(`${env.BIAS_API_URL}/transcribe-and-analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, source_name: sourceName }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return NextResponse.json(
      { error: 'Transcription service unavailable. Make sure the FastAPI service is running.' },
      { status: 503 },
    );
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Processing failed' }));
    return NextResponse.json({ error: err.detail ?? 'Processing failed' }, { status: res.status });
  }

  const data = (await res.json()) as ShortFormResult;

  const inputHash = hashInput(url);
  const embedding = await generateEmbedding(data.transcript);
  const insertedId = await writeAnalysis({
    input_hash: inputHash,
    input_text: data.transcript,
    result: {
      inputText: data.transcript,
      nlp: { sentiment: { overall: 0, perSentence: [] }, entities: [] },
      llm: { biasScore: 0, leaning: 'center', loadedLanguage: [], framing: '', explanation: '' },
      signals: { biasScore: 0, leaning: 'center', chargedLanguageScore: 0, entitySentiment: [], agreement: 'neutral' },
      hf: data.bias,
    },
    embedding,
    bias_score: data.bias.score,
    leaning: 'unclear',
    model: 'hf-whisper',
    hf_score: data.bias.score,
    hf_label: data.bias.label,
    content_type: 'short_form',
    input_url: url,
  });

  const user = await getCurrentUser().catch(() => null);
  if (user && insertedId) {
    await getSupabase()
      .from(USER_ANALYSES_TABLE)
      .upsert(
        { user_id: user.id, analysis_id: insertedId, share_slug: nanoid(10) },
        { onConflict: 'user_id,analysis_id', ignoreDuplicates: true },
      );
  }

  return NextResponse.json({ ...data, id: insertedId });
}
