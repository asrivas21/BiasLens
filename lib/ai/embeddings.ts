import 'server-only';
import { getOpenAIClient, openaiConfig } from '@/lib/ai/openai';
import { classifyOpenAIError } from '@/lib/ai/openai-errors';
import { ApiException } from '@/lib/api/errors';
import { logger } from '@/lib/observability/logger';

// text-embedding-3-* models accept up to 8192 tokens per input. We cap at a
// conservative ~8000-token budget (rough 4 chars/token heuristic = 32_000 chars)
// to leave headroom for tokenizer variance and avoid 400s on edge inputs.
const EMBEDDING_MAX_INPUT_CHARS = 32_000;
const TRUNCATION_MARKER = '\n\n[…input truncated for length…]';

// text-embedding-3-small returns 1536-dim vectors by default.
const EMBEDDING_DIMENSIONS = 1536;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function truncateForEmbedding(text: string): { text: string; truncated: boolean } {
  if (text.length <= EMBEDDING_MAX_INPUT_CHARS) {
    return { text, truncated: false };
  }
  const head = text.slice(0, EMBEDDING_MAX_INPUT_CHARS);
  const boundary = Math.max(
    head.lastIndexOf('. '),
    head.lastIndexOf('! '),
    head.lastIndexOf('? '),
    head.lastIndexOf('\n'),
  );
  const cutoff = boundary > EMBEDDING_MAX_INPUT_CHARS * 0.6 ? boundary + 1 : EMBEDDING_MAX_INPUT_CHARS;
  return { text: head.slice(0, cutoff).trimEnd() + TRUNCATION_MARKER, truncated: true };
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
}

class OpenAIEmbeddingProvider implements EmbeddingProvider {
  async embed(text: string): Promise<number[]> {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      throw new ApiException('BAD_REQUEST', 'Cannot embed empty text.');
    }

    const client = getOpenAIClient();
    const model = openaiConfig.embeddingModel;
    const startedAt = Date.now();

    const { text: input, truncated } = truncateForEmbedding(trimmed);
    const estimatedInputTokens = estimateTokens(input);

    if (truncated) {
      logger.warn('embedding_input_truncated', {
        model,
        originalChars: trimmed.length,
        truncatedChars: input.length,
        estimatedInputTokens,
      });
    }

    let response;
    try {
      response = await client.embeddings.create({
        model,
        input,
        encoding_format: 'float',
      });
    } catch (err) {
      throw classifyOpenAIError(err, {
        providerLabel: 'Embedding provider',
        logPrefix: 'embedding',
        model,
        durationMs: Date.now() - startedAt,
      });
    }

    const vector = response.data[0]?.embedding;
    if (!Array.isArray(vector) || vector.length === 0) {
      logger.error('embedding_response_empty', { model });
      throw new ApiException(
        'LLM_FAILURE',
        'Embedding provider returned an empty response.',
      );
    }
    if (vector.length !== EMBEDDING_DIMENSIONS) {
      // Surface dimension mismatches loudly — downstream cosine-similarity / pgvector
      // index will silently misbehave if dimensions drift between requests.
      logger.error('embedding_dimension_mismatch', {
        model,
        expected: EMBEDDING_DIMENSIONS,
        actual: vector.length,
      });
      throw new ApiException(
        'LLM_FAILURE',
        'Embedding provider returned a vector of unexpected dimensionality.',
      );
    }

    logger.info('embedding_request_completed', {
      model,
      durationMs: Date.now() - startedAt,
      truncated,
      estimatedInputTokens,
      promptTokens: response.usage?.prompt_tokens,
      totalTokens: response.usage?.total_tokens,
      dimensions: vector.length,
    });

    return vector;
  }
}

let defaultProvider: EmbeddingProvider | null = null;

export function getEmbeddingProvider(): EmbeddingProvider {
  if (!defaultProvider) {
    defaultProvider = new OpenAIEmbeddingProvider();
  }
  return defaultProvider;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  return getEmbeddingProvider().embed(text);
}

export const EMBEDDING_VECTOR_DIMENSIONS = EMBEDDING_DIMENSIONS;
