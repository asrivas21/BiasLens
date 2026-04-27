import type { ApiError, ApiErrorCode } from '@/types/biaslens';

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  NOT_FOUND: 404,
  NOT_IMPLEMENTED: 501,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  LLM_FAILURE: 502,
  INTERNAL: 500,
};

export function jsonOk<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function jsonError(
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): Response {
  const body: ApiError = { error: { code, message, details } };
  return Response.json(body, { status: STATUS_BY_CODE[code] });
}

export function notImplemented(feature: string): Response {
  return jsonError('NOT_IMPLEMENTED', `${feature} is not implemented yet.`);
}
