import { env } from '@/lib/config/env';

export async function GET() {
  try {
    await fetch(`${env.BIAS_API_URL}/health`, { signal: AbortSignal.timeout(5_000) });
  } catch {
    // Silently swallow — this is a best-effort warm-up ping.
  }
  return new Response('ok');
}
