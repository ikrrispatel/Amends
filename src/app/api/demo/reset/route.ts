import { errorResponse, enforceRateLimit, jsonResponse } from '@/app/api/common';
import { ResetDemoBodySchema, resetDemoRuntime } from '@/application/demo-api';

export async function POST(request: Request) {
  const limited = enforceRateLimit(request);
  if (limited) return limited;

  try {
    const body = await request.json();
    ResetDemoBodySchema.parse(body);
    resetDemoRuntime();
    return jsonResponse({ status: 'ok', message: 'Demo state reset.' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Reset requires explicit permission.';
    return errorResponse(400, 'RESET_REJECTED', message);
  }
}
