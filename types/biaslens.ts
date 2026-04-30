export type EntityType =
  | 'PERSON'
  | 'ORG'
  | 'GPE'
  | 'MONEY'
  | 'DATE'
  | 'TIME'
  | 'PERCENT'
  | 'CARDINAL'
  | 'MISC';

export type Leaning = 'far-left' | 'left' | 'center' | 'right' | 'far-right';

export type SentenceSentiment = {
  text: string;
  score: number;
  flaggedTerms: string[];
  start: number;
  end: number;
};

export type Entity = {
  text: string;
  type: EntityType;
  start: number;
  end: number;
};

export type NlpAnalysis = {
  sentiment: {
    overall: number;
    perSentence: SentenceSentiment[];
  };
  entities: Entity[];
};

export type LoadedPhrase = {
  phrase: string;
  reason: string;
};

export type LlmAnalysis = {
  biasScore: number; // signed -1..+1 (negative = left, positive = right)
  leaning: Leaning;
  loadedLanguage: LoadedPhrase[];
  framing: string;
  explanation: string;
};

// Either a raw text passage, or a URL the server will fetch and extract.
export type AnalyzeRequest = { text: string } | { url: string };

// Provenance for results derived from a fetched URL. Omitted when the user
// pasted text directly.
export type AnalysisSource = {
  type: 'url';
  url: string;
  title: string | null;
  siteName: string | null;
  truncated?: boolean;
};

export type EntitySignal = {
  entity: string;
  type: EntityType;
  mentions: number;
  avgSentiment: number;
  loadedPhrasesNearby: string[];
  flaggedTermsNearby: string[];
};

export type SignalAgreement = 'aligned' | 'llm-only' | 'nlp-only' | 'neutral';

export type Signals = {
  biasScore: number;
  leaning: Leaning;
  chargedLanguageScore: number;
  entitySentiment: EntitySignal[];
  agreement: SignalAgreement;
};

export type AnalyzeResponse = {
  id: string;
  inputText: string;
  nlp: NlpAnalysis;
  llm: LlmAnalysis;
  signals: Signals;
  source?: AnalysisSource;
  cached: boolean;
  createdAt: string;
};

export type AnalysisSummary = {
  id: string;
  inputPreview: string;
  biasScore: number;
  leaning: Leaning;
  createdAt: string;
};

export type AnalysisListResponse = {
  items: AnalysisSummary[];
  nextCursor: string | null;
};

export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'NOT_FOUND'
  | 'NOT_IMPLEMENTED'
  | 'PAYLOAD_TOO_LARGE'
  | 'RATE_LIMITED'
  | 'LLM_FAILURE'
  | 'INTERNAL';

export type ApiError = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

export type HealthResponse = {
  ok: true;
  service: 'biaslens';
};
