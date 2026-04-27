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
import { ApiException } from '@/lib/api/errors';
import { logger } from '@/lib/observability/logger';

export interface OpenAIErrorContext {
  // Human-readable label used in the error message returned to clients,
  // e.g. "Bias analysis provider" or "Embedding provider".
  providerLabel: string;
  // Prefix for structured log events, e.g. "llm" yields "llm_rate_limited".
  logPrefix: string;
  model: string;
  durationMs: number;
}

export function classifyOpenAIError(err: unknown, ctx: OpenAIErrorContext): ApiException {
  const { providerLabel, logPrefix, model, durationMs } = ctx;
  const message = err instanceof Error ? err.message : String(err);
  const base = { model, durationMs, message } as const;

  if (err instanceof RateLimitError) {
    logger.warn(`${logPrefix}_rate_limited`, base);
    return new ApiException(
      'LLM_FAILURE',
      `${providerLabel} is rate-limiting requests. Try again shortly.`,
    );
  }
  if (err instanceof AuthenticationError || err instanceof PermissionDeniedError) {
    logger.error(`${logPrefix}_auth_failed`, base);
    return new ApiException(
      'LLM_FAILURE',
      `${providerLabel} rejected the credentials.`,
    );
  }
  if (err instanceof BadRequestError) {
    logger.error(`${logPrefix}_bad_request`, base);
    return new ApiException(
      'LLM_FAILURE',
      `${providerLabel} rejected the request.`,
    );
  }
  if (err instanceof APIConnectionTimeoutError) {
    logger.warn(`${logPrefix}_timeout`, base);
    return new ApiException(
      'LLM_FAILURE',
      `${providerLabel} timed out. Try again shortly.`,
    );
  }
  if (err instanceof APIConnectionError) {
    logger.warn(`${logPrefix}_connection_error`, base);
    return new ApiException(
      'LLM_FAILURE',
      `${providerLabel} is unreachable. Try again shortly.`,
    );
  }
  if (err instanceof InternalServerError) {
    logger.error(`${logPrefix}_server_error`, base);
    return new ApiException(
      'LLM_FAILURE',
      `${providerLabel} is currently unavailable. Try again shortly.`,
    );
  }
  if (err instanceof APIUserAbortError) {
    logger.warn(`${logPrefix}_aborted`, base);
    return new ApiException('LLM_FAILURE', `${providerLabel} request was aborted.`);
  }

  logger.error(`${logPrefix}_request_failed`, base);
  return new ApiException('LLM_FAILURE', `${providerLabel} request failed.`);
}
