import type { NextRequest } from 'next/server';
import { notImplemented } from '@/lib/api/responses';
import { withErrorHandling } from '@/lib/api/errors';
import { withRequest } from '@/lib/api/with-request';

export const GET = withRequest(
  withErrorHandling(
    async (_request: NextRequest, ctx: RouteContext<'/api/analyses/[id]'>) => {
      const { id } = await ctx.params;
      return notImplemented(`GET /api/analyses/${id}`);
    },
  ),
);
