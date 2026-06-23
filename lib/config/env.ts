import 'server-only';

const DEFAULTS = {
  OPENAI_MODEL: 'gpt-4o-mini',
  OPENAI_EMBEDDING_MODEL: 'text-embedding-3-small',
} as const;

export type NodeEnv = 'development' | 'test' | 'production';

function required(key: string): string {
  const value = process.env[key];
  if (!value || value.trim() === '') {
    throw new Error(
      `[biaslens/env] Missing required environment variable: ${key}. ` +
        `Add it to .env.local (see .env.example).`,
    );
  }
  return value;
}

function optional(key: string, fallback: string): string {
  const value = process.env[key];
  return value && value.trim() !== '' ? value : fallback;
}

export const env = {
  get OPENAI_API_KEY(): string {
    return required('OPENAI_API_KEY');
  },
  get OPENAI_MODEL(): string {
    return optional('OPENAI_MODEL', DEFAULTS.OPENAI_MODEL);
  },
  get OPENAI_EMBEDDING_MODEL(): string {
    return optional('OPENAI_EMBEDDING_MODEL', DEFAULTS.OPENAI_EMBEDDING_MODEL);
  },
  get SUPABASE_URL(): string {
    return required('SUPABASE_URL').replace(/\/+$/, '');
  },
  get SUPABASE_SERVICE_ROLE_KEY(): string {
    return required('SUPABASE_SERVICE_ROLE_KEY');
  },
  get BIAS_API_URL(): string {
    return optional('BIAS_API_URL', 'http://localhost:8000');
  },
  get NODE_ENV(): NodeEnv {
    const value = process.env.NODE_ENV;
    return value === 'production' || value === 'test' ? value : 'development';
  },
} as const;

export function validateEnv(): void {
  void env.OPENAI_API_KEY;
  void env.OPENAI_MODEL;
  void env.OPENAI_EMBEDDING_MODEL;
  void env.SUPABASE_URL;
  void env.SUPABASE_SERVICE_ROLE_KEY;
  void env.NODE_ENV;
}
