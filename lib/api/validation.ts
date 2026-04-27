import { z } from 'zod';
import { ApiException } from '@/lib/api/errors';

export const MAX_BODY_BYTES = 200 * 1024;
export const MIN_TEXT_LENGTH = 10;
export const MAX_TEXT_LENGTH = 50_000;

export const analyzeRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(MIN_TEXT_LENGTH, `text must be at least ${MIN_TEXT_LENGTH} characters.`)
    .max(MAX_TEXT_LENGTH, `text must be at most ${MAX_TEXT_LENGTH} characters.`),
});

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
