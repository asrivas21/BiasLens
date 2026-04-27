import { jsonOk } from '@/lib/api/responses';
import { ApiException, withErrorHandling } from '@/lib/api/errors';
import { analyzeRequestSchema, parseJsonBody } from '@/lib/api/validation';
import { withRequest } from '@/lib/api/with-request';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getRequestContext } from '@/lib/observability/logger';
import { analyzeBiasWithLlm } from '@/lib/ai/analyze-bias';
import { analyzeSentiment } from '@/lib/nlp/sentiment';
import { extractEntities } from '@/lib/nlp/ner';
import { computeSignals } from '@/lib/analysis/signals';
import type { AnalyzeResponse, NlpAnalysis } from '@/types/biaslens';

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
    const { text } = await parseJsonBody(request, analyzeRequestSchema);
    const sentiment = analyzeSentiment(text);
    const entities = extractEntities(text);
    const llm = await analyzeBiasWithLlm(text);

    const nlp: NlpAnalysis = {
      sentiment,
      entities,
    };
    const signals = computeSignals(nlp, llm);

    const body: AnalyzeResponse = {
      id: crypto.randomUUID(),
      inputText: text,
      nlp,
      llm,
      signals,
      cached: false,
      createdAt: new Date().toISOString(),
    };
    return jsonOk(body);
  }),
);
