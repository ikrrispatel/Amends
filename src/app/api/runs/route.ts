import { errorResponse, enforceRateLimit, jsonResponse } from '@/app/api/common';
import { CreateRunBodySchema, DEMO_INSTRUCTION_TEXT, getDemoRuntime } from '@/application/demo-api';

export async function POST(request: Request) {
  const limited = enforceRateLimit(request);
  if (limited) return limited;

  try {
    const body = await request.json();
    const parsed = CreateRunBodySchema.parse(body);
    const runtime = getDemoRuntime();
    const runId = parsed.runId ?? `run-${Date.now()}`;
    const runCode = parsed.runCode ?? runtime.defaultRunCode;

    const record = await runtime.orchestrator.createRun(runId, runCode, DEMO_INSTRUCTION_TEXT);
    return jsonResponse(
      {
        status: 'ok',
        run: {
          runId: record.runId,
          currentState: record.currentState,
          runCode: record.runCode,
        },
      },
      201,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request';
    if (message.includes('Duplicate demo run ID')) {
      return errorResponse(409, 'RUN_EXISTS', message);
    }
    return errorResponse(400, 'VALIDATION_FAILED', message);
  }
}
