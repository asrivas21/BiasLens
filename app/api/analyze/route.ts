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
import type { AnalysisSource, AnalyzeResponse, NlpAnalysis } from '@/types/biaslens';

const ANALYZE_RATE_LIMIT = 20;
const ANALYZE_WINDOW_MS = 60_000;

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

    // Resolve the input to a (text, optional source) pair. URL submissions go
    // through the extractor; the same length bounds are enforced post-extract
    // so a URL that yields a snippet is rejected for the same reason a typed
    // snippet would be.
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
        logger.info('url_extract_truncated', {
          url: input.url,
          extractedChars: text.length,
        });
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

    // Tier 1: exact-match cache by SHA-256 of the normalized input.
    const inputHash = hashInput(text);
    const exactHit = await lookupExactCache(inputHash, model);
    if (exactHit) {
      logger.info('analyze_cache_hit', { tier: 'exact', cachedId: exactHit.id });
      return jsonOk<AnalyzeResponse>({
        ...exactHit.result,
        id: exactHit.id,
        cached: true,
        createdAt: exactHit.created_at,
      });
    }

    // Tier 2: semantic cache via embedding ANN. Embedding is generated up-front
    // so a hit reuses it for the lookup and a miss reuses it for the write.
    const embedding = await generateEmbedding(text);
    const semanticHit = await lookupSemanticCache(embedding, model);
    if (semanticHit) {
      logger.info('analyze_cache_hit', {
        tier: 'semantic',
        cachedId: semanticHit.id,
        similarity: semanticHit.similarity,
      });
      return jsonOk<AnalyzeResponse>({
        ...semanticHit.result,
        id: semanticHit.id,
        cached: true,
        createdAt: semanticHit.created_at,
      });
    }

    // Cache miss — run the full pipeline.
    const sentiment = analyzeSentiment(text);
    const entities = extractEntities(text);
    const llm = await analyzeBiasWithLlm(text);

    const nlp: NlpAnalysis = {
      sentiment,
      entities,
    };
    const signals = computeSignals(nlp, llm);

    // `source` is folded into the cached payload so subsequent hits retain
    // the URL provenance without needing a separate column.
    const cachePayload = { inputText: text, nlp, llm, signals, ...(source ? { source } : {}) };
    const insertedId = await writeAnalysis({
      input_hash: inputHash,
      input_text: text,
      result: cachePayload,
      embedding,
      bias_score: llm.biasScore,
      leaning: llm.leaning,
      model,
    });

    const responseBody: AnalyzeResponse = {
      id: insertedId ?? crypto.randomUUID(),
      ...cachePayload,
      cached: false,
      createdAt: new Date().toISOString(),
    };
    return jsonOk(responseBody);
  }),
);
