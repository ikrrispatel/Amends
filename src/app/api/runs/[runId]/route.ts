import { z } from 'zod';

import { errorResponse, enforceRateLimit, jsonResponse, resolveUrlRunId, runIdSchema } from '@/app/api/common';
import { getDemoRuntime, sanitizeRunSnapshot } from '@/application/demo-api';

const runIdParamSchema = z.object({
  runId: runIdSchema(),
});

export async function GET(_request: Request, context?: { params?: Promise<{ runId: string }> | { runId: string } }) {
  const limited = enforceRateLimit(_request);
  if (limited) return limited;

  try {
    const params = context?.params ? await Promise.resolve(context.params) : { runId: await resolveUrlRunId(_request) };
    const { runId } = runIdParamSchema.parse(params);
    const runtime = getDemoRuntime();
    const record = await runtime.repository.get(runId);

    if (!record) {
      return errorResponse(404, 'RUN_NOT_FOUND', `Run ${runId} was not found.`);
    }

    return jsonResponse({ status: 'ok', run: sanitizeRunSnapshot(record) });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid run ID';
    return errorResponse(400, 'INVALID_RUN_ID', message);
  }
}
