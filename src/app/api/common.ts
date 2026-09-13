import crypto from 'node:crypto';

import { NextResponse } from 'next/server';
import { z } from 'zod';

import { consume } from '@/lib/rate-limit';

export const API_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
} as const;

export function jsonResponse<T>(body: T, status = 200, extraHeaders: Record<string, string> = {}): NextResponse {
  return NextResponse.json(body, {
    status,
    headers: {
      ...API_HEADERS,
      ...extraHeaders,
    },
  });
}

export function enforceRateLimit(req: Request): NextResponse | null {
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
  const result = consume(ip);

  if (result.limited) {
    return jsonResponse(
      {
        error: {
          code: 'RATE_LIMITED',
          message: 'Rate limit exceeded.',
        },
      },
      429,
      {
        'Retry-After': String(result.retryAfter),
      },
    );
  }

  return null;
}

export function parseStrictBody<T>(req: Request, schema: z.ZodType<T>): T {
  if (req.headers.get('content-type') && !req.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Unsupported content type. Use application/json.');
  }

  return schema.parse(req.json());
}

export function parseJsonBody<T>(req: Request, schema: z.ZodType<T>): T {
  return schema.parse(req.json());
}

export function errorResponse(status: number, code: string, message: string): NextResponse {
  return jsonResponse(
    {
      error: {
        code,
        message,
      },
    },
    status,
  );
}

export function routeFailureResponse(record: { currentState?: string; sanitizedFailure?: { code?: string; message?: string } | null }, fallbackCode = 'BUSINESS_REJECTION'): NextResponse {
  const state = record.currentState ?? 'UNKNOWN';
  const message = record.sanitizedFailure?.message ?? `Run rejected while in ${state}.`;
  const code = record.sanitizedFailure?.code ?? fallbackCode;
  return errorResponse(400, code, message);
}

export function runIdSchema() {
  return z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/);
}

export function createRequestId(): string {
  return crypto.randomUUID();
}

export async function resolveUrlRunId(request: Request, context?: { params?: Record<string, string> | Promise<Record<string, string>> }): Promise<string> {
  const params = context?.params ? await Promise.resolve(context.params) : null;
  if (params && params.runId) {
    return params.runId;
  }

  const pathname = new URL(request.url).pathname;
  const match = pathname.match(/^\/api\/runs\/([^/]+)(?:\/.*)?$/);
  return match?.[1] ?? '';
}
