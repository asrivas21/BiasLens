import 'server-only';
import { logger, runWithRequestContext } from '@/lib/observability/logger';
import { getClientIp } from '@/lib/api/rate-limit';

type Handler<Args extends unknown[]> = (...args: Args) => Promise<Response>;

export function withRequest<Args extends unknown[]>(
  handler: Handler<Args>,
): Handler<Args> {
  return async (...args: Args) => {
    const request = args[0] as Request;
    const requestId =
      request.headers.get('x-request-id') ?? crypto.randomUUID();
    const ip = getClientIp(request);
    const route = new URL(request.url).pathname;
    const method = request.method;
    const startedAt = Date.now();

    return runWithRequestContext(
      { requestId, ip, route, method },
      async () => {
        logger.info('request_started');
        const response = await handler(...args);
        const durationMs = Date.now() - startedAt;
        logger.info('request_completed', {
          status: response.status,
          durationMs,
        });
        response.headers.set('x-request-id', requestId);
        return response;
      },
    );
  };
}
