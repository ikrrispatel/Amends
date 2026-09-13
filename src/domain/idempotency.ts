import { createHash } from 'node:crypto';
import { z } from 'zod';

import { RecoveryActionTypeSchema } from './recovery';

export const SanitizedFailureSchema = z
  .object({
    code: z.enum(['UNKNOWN', 'VALIDATION_ERROR', 'PRECONDITION_FAILED', 'TIMEOUT', 'PROVIDER_REJECTED', 'CONFLICT']).default('UNKNOWN'),
    message: z.string().trim().min(1).max(200).optional(),
    provider: z.enum(['Stripe', 'Notion', 'Slack']).optional(),
  })
  .strict();

export const ActionExecutionRecordSchema = z
  .object({
    runId: z.string().trim().min(1).max(128),
    planHash: z.string().trim().regex(/^[a-f0-9]{64}$/),
    actionId: z.string().trim().min(1).max(128),
    actionType: RecoveryActionTypeSchema,
    idempotencyKey: z.string().trim().min(1).max(128),
    status: z.enum(['PENDING', 'SUCCEEDED', 'FAILED', 'SKIPPED']).default('PENDING'),
    attempts: z.number().int().min(0).max(10).default(0),
    maxAttempts: z.number().int().min(1).max(10).default(3),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime().nullable().default(null),
    completedAt: z.string().datetime().nullable().default(null),
    failure: SanitizedFailureSchema.nullable().default(null),
  })
  .strict()
  .refine((record) => record.attempts <= record.maxAttempts, {
    message: 'Attempt count must not exceed maxAttempts',
    path: ['attempts'],
  })
  .refine((record) => {
    if (record.status === 'FAILED') return record.completedAt !== null;
    return true;
  }, {
    message: 'Failed terminal execution records must set completedAt',
    path: ['completedAt'],
  });

export type ActionExecutionRecord = z.infer<typeof ActionExecutionRecordSchema>;
export type SanitizedFailure = z.infer<typeof SanitizedFailureSchema>;

export function createIdempotencyKey(
  runId: string,
  planHash: string,
  actionId: string,
  actionType: string,
): string {
  const runIdValue = z.string().trim().min(1).max(128).parse(runId);
  const planHashValue = z.string().trim().regex(/^[a-f0-9]{64}$/).parse(planHash);
  const actionIdValue = z.string().trim().min(1).max(128).parse(actionId);
  const actionTypeValue = RecoveryActionTypeSchema.parse(actionType);

  const seed = `${runIdValue}:${planHashValue}:${actionIdValue}:${actionTypeValue}`;
  return createHash('sha256').update(seed, 'utf8').digest('hex');
}

export function recordFailedExecution(
  record: ActionExecutionRecord,
  error: SanitizedFailure,
): ActionExecutionRecord {
  const nextAttempts = Math.min(record.attempts + 1, record.maxAttempts);
  const timestamp = new Date().toISOString();

  return ActionExecutionRecordSchema.parse({
    ...record,
    status: 'FAILED',
    attempts: nextAttempts,
    updatedAt: timestamp,
    completedAt: timestamp,
    failure: error,
  });
}
