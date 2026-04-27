import 'server-only';
import {
  APIConnectionError,
  APIConnectionTimeoutError,
  APIUserAbortError,
  AuthenticationError,
  BadRequestError,
  InternalServerError,
  PermissionDeniedError,
  RateLimitError,
} from 'openai';
import { ZodError } from 'zod';
import { ApiException } from '@/lib/api/errors';
import { getOpenAIClient, openaiConfig } from '@/lib/ai/openai';
import {
  BIAS_ANALYSIS_JSON_SCHEMA,
  BIAS_ANALYSIS_SCHEMA_NAME,
  BIAS_ANALYSIS_SYSTEM_PROMPT,
  buildBiasAnalysisUserPrompt,
} from '@/lib/ai/prompts/bias-analysis';
import { llmAnalysisSchema } from '@/lib/ai/schemas/llm-analysis';
import { logger } from '@/lib/observability/logger';
import type { LlmAnalysis } from '@/types/biaslens';

const LLM_MAX_INPUT_CHARS = 16_000;
const LLM_MAX_COMPLETION_TOKENS = 1500;
const TRUNCATION_MARKER = '\n\n[…input truncated for length…]';

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function truncateForLlm(text: string): { text: string; truncated: boolean } {
  if (text.length <= LLM_MAX_INPUT_CHARS) {
    return { text, truncated: false };
  }
  const head = text.slice(0, LLM_MAX_INPUT_CHARS);
  const boundary = Math.max(
    head.lastIndexOf('. '),
    head.lastIndexOf('! '),
    head.lastIndexOf('? '),
    head.lastIndexOf('\n'),
  );
  const cutoff = boundary > LLM_MAX_INPUT_CHARS * 0.6 ? boundary + 1 : LLM_MAX_INPUT_CHARS;
  return { text: head.slice(0, cutoff).trimEnd() + TRUNCATION_MARKER, truncated: true };
}

export interface BiasAnalyzer {
  analyze(text: string): Promise<LlmAnalysis>;
}

class OpenAIBiasAnalyzer implements BiasAnalyzer {
  async analyze(text: string): Promise<LlmAnalysis> {
    const client = getOpenAIClient();
    const model = openaiConfig.chatModel;
    const startedAt = Date.now();

    const { text: promptText, truncated } = truncateForLlm(text);
    const estimatedInputTokens = estimateTokens(promptText);

    if (truncated) {
      logger.warn('llm_input_truncated', {
        model,
        originalChars: text.length,
        truncatedChars: promptText.length,
        estimatedInputTokens,
      });
    }

    let completion;
    try {
      completion = await client.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: BIAS_ANALYSIS_SYSTEM_PROMPT },
          { role: 'user', content: buildBiasAnalysisUserPrompt(promptText) },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: BIAS_ANALYSIS_SCHEMA_NAME,
            schema: BIAS_ANALYSIS_JSON_SCHEMA as unknown as Record<string, unknown>,
            strict: true,
          },
        },
        temperature: 0.2,
        max_completion_tokens: LLM_MAX_COMPLETION_TOKENS,
      });
    } catch (err) {
      throw classifyOpenAIError(err, model, Date.now() - startedAt);
    }

    const choice = completion.choices[0];
    const content = choice?.message?.content;
    const finishReason = choice?.finish_reason;

    if (finishReason === 'length') {
      logger.warn('llm_response_truncated', { model });
      throw new ApiException(
        'LLM_FAILURE',
        'Bias analysis response was truncated before completion.',
      );
    }

    if (!content) {
      logger.error('llm_response_empty', { model, finishReason });
      throw new ApiException(
        'LLM_FAILURE',
        'Bias analysis provider returned an empty response.',
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      logger.error('llm_response_not_json', { model });
      throw new ApiException(
        'LLM_FAILURE',
        'Bias analysis response was not valid JSON.',
      );
    }

    let result: LlmAnalysis;
    try {
      result = llmAnalysisSchema.parse(parsed);
    } catch (err) {
      const issues = err instanceof ZodError ? err.issues : undefined;
      logger.error('llm_response_schema_invalid', { model, issues });
      throw new ApiException(
        'LLM_FAILURE',
        'Bias analysis response did not match expected schema.',
      );
    }

    logger.info('llm_request_completed', {
      model,
      durationMs: Date.now() - startedAt,
      truncated,
      estimatedInputTokens,
      promptTokens: completion.usage?.prompt_tokens,
      completionTokens: completion.usage?.completion_tokens,
      totalTokens: completion.usage?.total_tokens,
      leaning: result.leaning,
      biasScore: result.biasScore,
    });

    return result;
  }
}

let defaultAnalyzer: BiasAnalyzer | null = null;

export function getBiasAnalyzer(): BiasAnalyzer {
  if (!defaultAnalyzer) {
    defaultAnalyzer = new OpenAIBiasAnalyzer();
  }
  return defaultAnalyzer;
}

export async function analyzeBiasWithLlm(text: string): Promise<LlmAnalysis> {
  return getBiasAnalyzer().analyze(text);
}

function classifyOpenAIError(err: unknown, model: string, durationMs: number): ApiException {
  const message = err instanceof Error ? err.message : String(err);
  const base = { model, durationMs, message } as const;

  if (err instanceof RateLimitError) {
    logger.warn('llm_rate_limited', base);
    return new ApiException(
      'LLM_FAILURE',
      'Bias analysis provider is rate-limiting requests. Try again shortly.',
    );
  }
  if (err instanceof AuthenticationError || err instanceof PermissionDeniedError) {
    logger.error('llm_auth_failed', base);
    return new ApiException(
      'LLM_FAILURE',
      'Bias analysis provider rejected the credentials.',
    );
  }
  if (err instanceof BadRequestError) {
    logger.error('llm_bad_request', base);
    return new ApiException(
      'LLM_FAILURE',
      'Bias analysis provider rejected the request.',
    );
  }
  if (err instanceof APIConnectionTimeoutError) {
    logger.warn('llm_timeout', base);
    return new ApiException(
      'LLM_FAILURE',
      'Bias analysis provider timed out. Try again shortly.',
    );
  }
  if (err instanceof APIConnectionError) {
    logger.warn('llm_connection_error', base);
    return new ApiException(
      'LLM_FAILURE',
      'Bias analysis provider is unreachable. Try again shortly.',
    );
  }
  if (err instanceof InternalServerError) {
    logger.error('llm_server_error', base);
    return new ApiException(
      'LLM_FAILURE',
      'Bias analysis provider is currently unavailable. Try again shortly.',
    );
  }
  if (err instanceof APIUserAbortError) {
    logger.warn('llm_aborted', base);
    return new ApiException('LLM_FAILURE', 'Bias analysis request was aborted.');
  }

  logger.error('llm_request_failed', base);
  return new ApiException('LLM_FAILURE', 'Bias analysis provider request failed.');
}
