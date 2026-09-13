import { z } from 'zod';

import { errorResponse, enforceRateLimit, jsonResponse, resolveUrlRunId, routeFailureResponse, runIdSchema } from '@/app/api/common';
import { ApproveRunBodySchema, getDemoRuntime, sanitizeRunSnapshot } from '@/application/demo-api';

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
    const parsed = ApproveRunBodySchema.parse(body);
    const runtime = getDemoRuntime();

    const current = await runtime.repository.get(runId);
    if (current && current.currentState !== 'APPROVAL_PENDING') {
      await runtime.orchestrator.createApprovalPlan(runId, parsed.runCode);
    }

    const record = await runtime.orchestrator.approveRun(runId, parsed.runCode, parsed.approvedBy, parsed.approvalMessage);
    if (record.currentState === 'APPROVAL_DENIED' || record.currentState === 'PLAN_EXPIRED' || record.currentState === 'MANUAL_REVIEW') {
      return routeFailureResponse(record, 'APPROVAL_FAILED');
    }

    return jsonResponse({
      status: 'ok',
      run: sanitizeRunSnapshot(record),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Approval failed';
    return errorResponse(400, 'APPROVAL_FAILED', message);
  }
}
