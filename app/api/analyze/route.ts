import { jsonOk } from '@/lib/api/responses';
import { ApiException, withErrorHandling } from '@/lib/api/errors';
import {
  MAX_TEXT_LENGTH,
  MIN_TEXT_LENGTH,
  analyzeRequestSchema,
  parseJsonBody,
} from '@/lib/api/validation';
import { withRequest } from '@/lib/api/with-request';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getRequestContext, logger } from '@/lib/observability/logger';
import { analyzeBiasWithLlm } from '@/lib/ai/analyze-bias';
import { analyzeSentiment } from '@/lib/nlp/sentiment';
import { extractEntities } from '@/lib/nlp/ner';
import { generateEmbedding } from '@/lib/ai/embeddings';
import { computeSignals } from '@/lib/analysis/signals';
import { hashInput, lookupExactCache } from '@/lib/cache/exact';
import { lookupSemanticCache } from '@/lib/cache/semantic';
import { writeAnalysis } from '@/lib/cache/write';
import { openaiConfig } from '@/lib/ai/openai';
import { fetchAndExtractArticle } from '@/lib/extract/url';
import { getCurrentUser } from '@/lib/supabase-server-auth';
import { getSupabase, USER_ANALYSES_TABLE } from '@/lib/supabase';
import { env } from '@/lib/config/env';
import { nanoid } from 'nanoid';
import type { AnalysisSource, AnalyzeResponse, HfResult, NlpAnalysis } from '@/types/biaslens';

const ANALYZE_RATE_LIMIT = 20;
const ANALYZE_WINDOW_MS = 60_000;

async function callHfClassifier(text: string): Promise<HfResult | null> {
  try {
    const res = await fetch(`${env.BIAS_API_URL}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, content_type: 'article' }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return res.json() as Promise<HfResult>;
  } catch {
    logger.warn?.('hf_classifier_unavailable', { url: env.BIAS_API_URL });
    return null;
  }
}

async function associateWithUser(userId: string, analysisId: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.from(USER_ANALYSES_TABLE).upsert(
    { user_id: userId, analysis_id: analysisId, share_slug: nanoid(10) },
    { onConflict: 'user_id,analysis_id', ignoreDuplicates: true },
  );
}

export const POST = withRequest(
  withErrorHandling(async (request: Request) => {
    const ip = getRequestContext()?.ip ?? 'unknown';
    const rl = checkRateLimit(`analyze:${ip}`, ANALYZE_RATE_LIMIT, ANALYZE_WINDOW_MS);
    if (!rl.allowed) {
      throw new ApiException(
        'RATE_LIMITED',
        'Too many requests. Try again shortly.',
        { resetAt: rl.resetAt },
      );
    }
    const input = await parseJsonBody(request, analyzeRequestSchema);
    const model = openaiConfig.chatModel;

    let text: string;
    let source: AnalysisSource | undefined;
    if ('url' in input) {
      const article = await fetchAndExtractArticle(input.url);
      text = article.text;
      if (text.length < MIN_TEXT_LENGTH) {
        throw new ApiException(
          'BAD_REQUEST',
          `Extracted article text is too short (${text.length} chars; minimum ${MIN_TEXT_LENGTH}).`,
        );
      }
      let truncated = false;
      if (text.length > MAX_TEXT_LENGTH) {
        text = text.slice(0, MAX_TEXT_LENGTH);
        truncated = true;
        logger.info('url_extract_truncated', { url: input.url, extractedChars: text.length });
      }
      source = {
        type: 'url',
        url: article.finalUrl,
        title: article.title,
        siteName: article.siteName,
        ...(truncated ? { truncated } : {}),
      };
    } else {
      text = input.text;
    }

    const inputHash = hashInput(text);
    const exactHit = await lookupExactCache(inputHash, model);
    if (exactHit) {
      logger.info('analyze_cache_hit', { tier: 'exact', cachedId: exactHit.id });
      const user = await getCurrentUser().catch(() => null);
      if (user) await associateWithUser(user.id, exactHit.id);
      return jsonOk<AnalyzeResponse>({
        ...exactHit.result,
        id: exactHit.id,
        cached: true,
        createdAt: exactHit.created_at,
      });
    }

    const embedding = await generateEmbedding(text);
    const semanticHit = await lookupSemanticCache(embedding, model);
    if (semanticHit) {
      logger.info('analyze_cache_hit', { tier: 'semantic', cachedId: semanticHit.id, similarity: semanticHit.similarity });
      const user = await getCurrentUser().catch(() => null);
      if (user) await associateWithUser(user.id, semanticHit.id);
      return jsonOk<AnalyzeResponse>({
        ...semanticHit.result,
        id: semanticHit.id,
        cached: true,
        createdAt: semanticHit.created_at,
      });
    }

    // Cache miss — run full pipeline including optional HF classifier in parallel.
    const [sentiment, entities, llm, hf] = await Promise.all([
      Promise.resolve(analyzeSentiment(text)),
      Promise.resolve(extractEntities(text)),
      analyzeBiasWithLlm(text),
      callHfClassifier(text),
    ]);

    const nlp: NlpAnalysis = { sentiment, entities };
    const signals = computeSignals(nlp, llm);
    const cachePayload = {
      inputText: text,
      nlp,
      llm,
      signals,
      ...(hf ? { hf } : {}),
      ...(source ? { source } : {}),
    };

    const insertedId = await writeAnalysis({
      input_hash: inputHash,
      input_text: text,
      result: cachePayload,
      embedding,
      bias_score: llm.biasScore,
      leaning: llm.leaning,
      model,
      hf_score: hf?.score ?? null,
      hf_label: hf?.label ?? null,
    });

    const user = await getCurrentUser().catch(() => null);
    if (user && insertedId) await associateWithUser(user.id, insertedId);

    const responseBody: AnalyzeResponse = {
      id: insertedId ?? crypto.randomUUID(),
      ...cachePayload,
      cached: false,
      createdAt: new Date().toISOString(),
    };
    return jsonOk(responseBody);
  }),
);
