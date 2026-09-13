import { z } from 'zod';

import { errorResponse, enforceRateLimit, jsonResponse, resolveUrlRunId, runIdSchema } from '@/app/api/common';
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
    const record = await runtime.orchestrator.inspectRun(runId);
    return jsonResponse({
      status: 'ok',
      run: sanitizeRunSnapshot(record),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Inspection failed';
    return errorResponse(400, 'INSPECTION_FAILED', message);
  }
}
