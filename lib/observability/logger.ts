import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';

export type RequestContext = {
  requestId: string;
  ip: string;
  route: string;
  method: string;
};

type LogLevel = 'info' | 'warn' | 'error';

const storage = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return storage.getStore();
}

function emit(level: LogLevel, event: string, meta?: Record<string, unknown>): void {
  const ctx = getRequestContext();
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    event,
    ...(ctx ?? {}),
    ...(meta ?? {}),
  });
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info(event: string, meta?: Record<string, unknown>): void {
    emit('info', event, meta);
  },
  warn(event: string, meta?: Record<string, unknown>): void {
    emit('warn', event, meta);
  },
  error(event: string, meta?: Record<string, unknown>): void {
    emit('error', event, meta);
  },
};
