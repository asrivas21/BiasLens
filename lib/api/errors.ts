import { ZodError } from 'zod';
import type { ApiErrorCode } from '@/types/biaslens';
import { jsonError } from '@/lib/api/responses';

export class ApiException extends Error {
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiException';
    this.code = code;
    this.details = details;
  }
}

type Handler<Args extends unknown[]> = (...args: Args) => Promise<Response>;

export function withErrorHandling<Args extends unknown[]>(
  handler: Handler<Args>,
): Handler<Args> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof ApiException) {
        return jsonError(err.code, err.message, err.details);
      }
      if (err instanceof ZodError) {
        return jsonError('BAD_REQUEST', 'Invalid request body.', err.issues);
      }
      console.error('[biaslens] unhandled route error', err);
      return jsonError('INTERNAL', 'An unexpected error occurred.');
    }
  };
}
