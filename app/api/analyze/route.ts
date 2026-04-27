import { jsonOk } from '@/lib/api/responses';
import { ApiException, withErrorHandling } from '@/lib/api/errors';
import { analyzeRequestSchema, parseJsonBody } from '@/lib/api/validation';
import { withRequest } from '@/lib/api/with-request';
import { checkRateLimit } from '@/lib/api/rate-limit';
import { getRequestContext } from '@/lib/observability/logger';
import { analyzeBiasWithLlm } from '@/lib/ai/analyze-bias';
import type { AnalyzeResponse, NlpAnalysis } from '@/types/biaslens';

const ANALYZE_RATE_LIMIT = 20;
const ANALYZE_WINDOW_MS = 60_000;

const NLP_STUB: NlpAnalysis = {
  sentiment: { overall: 0, perSentence: [] },
  entities: [],
};

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
    const llm = await analyzeBiasWithLlm(text);

    const body: AnalyzeResponse = {
      id: crypto.randomUUID(),
      inputText: text,
      nlp: NLP_STUB,
      llm,
      cached: false,
      createdAt: new Date().toISOString(),
    };
    return jsonOk(body);
  }),
);
