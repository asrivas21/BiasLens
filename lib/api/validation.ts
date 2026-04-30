import { z } from 'zod';
import { ApiException } from '@/lib/api/errors';
import { MAX_BODY_BYTES, MAX_TEXT_LENGTH, MIN_TEXT_LENGTH } from '@/lib/api/limits';

export { MAX_BODY_BYTES, MAX_TEXT_LENGTH, MIN_TEXT_LENGTH };

// Body validation for POST /api/analyze. Accepts either { text } or { url };
// for URL submissions length checks are deferred until after the article body
// is extracted (see the route handler).
export const analyzeRequestSchema = z.union([
  z.object({
    text: z
      .string()
      .trim()
      .min(MIN_TEXT_LENGTH, `text must be at least ${MIN_TEXT_LENGTH} characters.`)
      .max(MAX_TEXT_LENGTH, `text must be at most ${MAX_TEXT_LENGTH} characters.`),
  }),
  z.object({
    url: z.url('url must be a valid http(s) URL.'),
  }),
]);

export type AnalyzeRequestInput = z.infer<typeof analyzeRequestSchema>;

export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  const raw = await request.text();

  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    throw new ApiException(
      'PAYLOAD_TOO_LARGE',
      `Request body exceeds ${MAX_BODY_BYTES} bytes.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = raw.length === 0 ? undefined : JSON.parse(raw);
  } catch {
    throw new ApiException('BAD_REQUEST', 'Request body is not valid JSON.');
  }

  return schema.parse(parsed);
}
