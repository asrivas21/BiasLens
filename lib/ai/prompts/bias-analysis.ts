import { LEANING_VALUES, MAX_LOADED_PHRASES } from '@/lib/ai/schemas/llm-analysis';

export const BIAS_ANALYSIS_SCHEMA_NAME = 'BiasAnalysis';

export const BIAS_ANALYSIS_SYSTEM_PROMPT = `You are an impartial media-bias analyst.

Your job is to assess how a piece of text is framed, NOT whether its claims are
true or false. You must never assert, confirm, or deny the factual accuracy of
any statement in the input. Fact-checking is explicitly out of scope.

Evaluate the input on three dimensions:

1. Loaded language: identify specific words or short phrases that carry
   emotional weight, partisan connotation, or rhetorical slant. For each, give
   a one-sentence reason explaining the bias signal it conveys. List at most
   ${MAX_LOADED_PHRASES} of the most salient phrases. If none are present,
   return an empty array.

2. Framing: in 1-3 sentences, describe the narrative angle. Who is presented
   as the protagonist or antagonist? What is emphasized, downplayed, or
   omitted? What rhetorical structure is used?

3. Overall political leaning and intensity:
   - "leaning" must be exactly one of: ${LEANING_VALUES.map((v) => `"${v}"`).join(', ')}.
   - "biasScore" is a signed number in [-1, 1] where the sign indicates
     direction (negative = left-leaning, positive = right-leaning) and the
     magnitude indicates intensity (0 = neutral, +/-1 = extreme).
   - The sign of biasScore MUST agree with leaning: far-left in [-1, -0.6],
     left in (-0.6, -0.2), center in [-0.2, 0.2], right in (0.2, 0.6),
     far-right in (0.6, 1].

Calibration rules:
- Be conservative. If the evidence is thin, prefer "center" and a score near 0.
- Do not invent loaded phrases; only cite text that actually appears in the
  input.
- Do not speculate about the author's identity, motives, or affiliations.
- "explanation" must be 2-5 sentences in plain language summarizing the
  reasoning behind the score and leaning, citing the loaded language and
  framing observations. Do not include factual rebuttals.

Respond ONLY with JSON conforming to the provided schema. No preamble, no
markdown, no commentary outside the JSON.`;

export function buildBiasAnalysisUserPrompt(text: string): string {
  return `Analyze the following text for media bias signals.

--- BEGIN TEXT ---
${text}
--- END TEXT ---`;
}

export const BIAS_ANALYSIS_JSON_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['biasScore', 'leaning', 'loadedLanguage', 'framing', 'explanation'],
  properties: {
    biasScore: {
      type: 'number',
      description:
        'Signed bias intensity in [-1, 1]. Negative = left, positive = right, 0 = neutral.',
    },
    leaning: {
      type: 'string',
      enum: [...LEANING_VALUES],
      description: 'Overall political leaning category.',
    },
    loadedLanguage: {
      type: 'array',
      description:
        'Specific loaded phrases drawn verbatim from the input, with a brief reason for each.',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['phrase', 'reason'],
        properties: {
          phrase: {
            type: 'string',
            description: 'A short phrase quoted from the input text.',
          },
          reason: {
            type: 'string',
            description:
              'One-sentence explanation of the bias signal this phrase conveys.',
          },
        },
      },
    },
    framing: {
      type: 'string',
      description:
        '1-3 sentences describing the narrative angle: protagonist/antagonist, what is emphasized or omitted.',
    },
    explanation: {
      type: 'string',
      description:
        '2-5 plain-language sentences summarizing the reasoning behind the score and leaning. No fact-checking.',
    },
  },
} as const;
