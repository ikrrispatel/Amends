import { z } from 'zod';

import { errorResponse, enforceRateLimit, jsonResponse, resolveUrlRunId, routeFailureResponse, runIdSchema } from '@/app/api/common';
import { EmptyBodySchema, getDemoRuntime, sanitizeRunSnapshot } from '@/application/demo-api';

const runIdParamSchema = z.object({
  runId: runIdSchema(),
});

export async function POST(request: Request, context?: { params?: Promise<{ runId: string }> | { runId: string } }) {
  const limited = enforceRateLimit(request);
  if (limited) return limited;

  try {
    const params = context?.params ? await Promise.resolve(context.params) : { runId: await resolveUrlRunId(request, context) };
    const { runId } = runIdParamSchema.parse(params);
    const body = await request.json();
    EmptyBodySchema.parse(body);
    const runtime = getDemoRuntime();
    const record = await runtime.orchestrator.executeRecovery(runId);
    if (record.currentState === 'MANUAL_REVIEW' || record.currentState === 'PLAN_EXPIRED' || record.currentState === 'APPROVAL_DENIED' || record.currentState === 'RECOVERY_PARTIAL' || record.currentState === 'VERIFICATION_FAILED' || record.sanitizedFailure?.message === 'RECOVERY_ALREADY_COMPLETED') {
      return routeFailureResponse(record, 'RECOVERY_FAILED');
    }
    return jsonResponse({
      status: 'ok',
      run: sanitizeRunSnapshot(record),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Recovery failed';
    return errorResponse(400, 'RECOVERY_FAILED', message);
  }
}
