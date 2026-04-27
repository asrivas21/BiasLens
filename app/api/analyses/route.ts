import { notImplemented } from '@/lib/api/responses';
import { withErrorHandling } from '@/lib/api/errors';
import { withRequest } from '@/lib/api/with-request';

export const GET = withRequest(
  withErrorHandling(async () => {
    return notImplemented('GET /api/analyses');
  }),
);
