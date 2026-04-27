import 'server-only';
import OpenAI from 'openai';
import { env } from '@/lib/config/env';

const TIMEOUT_MS = 30_000;
const MAX_RETRIES = 2;

let client: OpenAI | null = null;

export function getOpenAIClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      timeout: TIMEOUT_MS,
      maxRetries: MAX_RETRIES,
    });
  }
  return client;
}

export const openaiConfig = {
  get chatModel(): string {
    return env.OPENAI_MODEL;
  },
  get embeddingModel(): string {
    return env.OPENAI_EMBEDDING_MODEL;
  },
  timeoutMs: TIMEOUT_MS,
  maxRetries: MAX_RETRIES,
} as const;
