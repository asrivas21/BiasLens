import type {
  AnalyzeRequest,
  AnalyzeResponse,
  ApiError,
  ApiErrorCode,
} from '@/types/biaslens';

// Thrown by client-side API helpers when the server returns a non-2xx
// response. Carries the structured error code so callers can branch on
// e.g. RATE_LIMITED without parsing the message.
export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function parseError(res: Response): Promise<ApiClientError> {
  let body: ApiError | null = null;
  try {
    body = (await res.json()) as ApiError;
  } catch {
    // Non-JSON error body — fall through with a generic message.
  }
  const code = body?.error?.code ?? 'INTERNAL';
  const message = body?.error?.message ?? `Request failed with status ${res.status}.`;
  return new ApiClientError(code, message, res.status, body?.error?.details);
}

async function postAnalyze(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  const res = await fetch('/api/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw await parseError(res);
  }

  return (await res.json()) as AnalyzeResponse;
}

export function analyzeText(text: string): Promise<AnalyzeResponse> {
  return postAnalyze({ text });
}

export function analyzeUrl(url: string): Promise<AnalyzeResponse> {
  return postAnalyze({ url });
}
