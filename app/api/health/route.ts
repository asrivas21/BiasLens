import { jsonOk } from '@/lib/api/responses';
import type { HealthResponse } from '@/types/biaslens';

export async function GET(): Promise<Response> {
  const body: HealthResponse = { ok: true, service: 'biaslens' };
  return jsonOk(body);
}
