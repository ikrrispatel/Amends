import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { consume } from '@/lib/rate-limit';
export async function GET(req: Request) {
  // Apply the IP limiter
  const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
  const res = consume(ip);
  if (res.limited) {
    return new NextResponse(JSON.stringify({ status: 'error', message: 'Rate limit exceeded' }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(res.retryAfter),
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  }

  const requestId = crypto.randomUUID();
  return new NextResponse(JSON.stringify({ status: 'ok', requestId }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
