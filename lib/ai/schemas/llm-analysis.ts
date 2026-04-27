import { z } from 'zod';
import type { LlmAnalysis } from '@/types/biaslens';

export const LEANING_VALUES = [
  'far-left',
  'left',
  'center',
  'right',
  'far-right',
] as const;

export const MAX_LOADED_PHRASES = 12;

export const loadedPhraseSchema = z.object({
  phrase: z.string().min(1).max(200),
  reason: z.string().min(1).max(300),
});

export const llmAnalysisSchema = z.object({
  biasScore: z.number().min(-1).max(1),
  leaning: z.enum(LEANING_VALUES),
  loadedLanguage: z.array(loadedPhraseSchema).max(MAX_LOADED_PHRASES),
  framing: z.string().min(1).max(800),
  explanation: z.string().min(1).max(1500),
});

const _typeCheck: z.ZodType<LlmAnalysis> = llmAnalysisSchema;
void _typeCheck;
