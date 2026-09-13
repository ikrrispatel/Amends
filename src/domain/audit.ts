import { z } from 'zod';

import { RecoveryActionTypeSchema } from './recovery';
import { RunStateSchema } from './run-states';

const AuditMetadataSchema = z
  .object({
    provider: z.enum(['Stripe', 'Notion', 'Slack']).optional(),
    runCode: z.string().trim().min(1).max(128).optional(),
    message: z.string().trim().min(1).max(500).optional(),
    sanitizedError: z.string().trim().min(1).max(200).optional(),
    requestId: z.string().trim().min(1).max(128).optional(),
    actionType: RecoveryActionTypeSchema.optional(),
    idempotencyKey: z.string().trim().min(1).max(128).optional(),
    planHash: z.string().trim().regex(/^[a-f0-9]{64}$/).optional(),
    state: RunStateSchema.optional(),
  })
  .strict();

export const AuditEventSchema = z.discriminatedUnion('eventType', [
  z.object({
    eventType: z.literal('INSPECTION_STARTED'),
    runId: z.string().trim().min(1).max(128),
    sequence: z.number().int().nonnegative(),
    occurredAt: z.string().datetime(),
    metadata: AuditMetadataSchema.extend({
      fromState: RunStateSchema,
      toState: RunStateSchema,
    }).strict(),
  }).strict(),
  z.object({
    eventType: z.literal('PLAN_CREATED'),
    runId: z.string().trim().min(1).max(128),
    sequence: z.number().int().nonnegative(),
    occurredAt: z.string().datetime(),
    metadata: AuditMetadataSchema.extend({
      planHash: z.string().trim().regex(/^[a-f0-9]{64}$/),
    }).strict(),
  }).strict(),
  z.object({
    eventType: z.literal('APPROVAL_REQUESTED'),
    runId: z.string().trim().min(1).max(128),
    sequence: z.number().int().nonnegative(),
    occurredAt: z.string().datetime(),
    metadata: AuditMetadataSchema.extend({
      runCode: z.string().trim().min(1).max(128),
      approvalCode: z.string().trim().min(1).max(128),
      expiresAt: z.string().datetime(),
    }).strict(),
  }).strict(),
  z.object({
    eventType: z.literal('APPROVAL_GRANTED'),
    runId: z.string().trim().min(1).max(128),
    sequence: z.number().int().nonnegative(),
    occurredAt: z.string().datetime(),
    metadata: AuditMetadataSchema.extend({
      runCode: z.string().trim().min(1).max(128),
      approvedBy: z.string().trim().min(1).max(128),
    }).strict(),
  }).strict(),
  z.object({
    eventType: z.literal('APPROVAL_DENIED'),
    runId: z.string().trim().min(1).max(128),
    sequence: z.number().int().nonnegative(),
    occurredAt: z.string().datetime(),
    metadata: AuditMetadataSchema.extend({
      reason: z.string().trim().min(1).max(200),
    }).strict(),
  }).strict(),
  z.object({
    eventType: z.literal('ACTION_STARTED'),
    runId: z.string().trim().min(1).max(128),
    sequence: z.number().int().nonnegative(),
    occurredAt: z.string().datetime(),
    metadata: AuditMetadataSchema.extend({
      actionType: RecoveryActionTypeSchema,
      idempotencyKey: z.string().trim().min(1).max(128),
      state: RunStateSchema,
    }).strict(),
  }).strict(),
  z.object({
    eventType: z.literal('ACTION_COMPLETED'),
    runId: z.string().trim().min(1).max(128),
    sequence: z.number().int().nonnegative(),
    occurredAt: z.string().datetime(),
    metadata: AuditMetadataSchema.extend({
      actionType: RecoveryActionTypeSchema,
      idempotencyKey: z.string().trim().min(1).max(128),
      executionStatus: z.enum(['SUCCEEDED', 'SKIPPED']),
    }).strict(),
  }).strict(),
  z.object({
    eventType: z.literal('ACTION_FAILED'),
    runId: z.string().trim().min(1).max(128),
    sequence: z.number().int().nonnegative(),
    occurredAt: z.string().datetime(),
    metadata: AuditMetadataSchema.extend({
      actionType: RecoveryActionTypeSchema,
      idempotencyKey: z.string().trim().min(1).max(128),
      sanitizedError: z.string().trim().min(1).max(200),
    }).strict(),
  }).strict(),
  z.object({
    eventType: z.literal('VERIFICATION_PASSED'),
    runId: z.string().trim().min(1).max(128),
    sequence: z.number().int().nonnegative(),
    occurredAt: z.string().datetime(),
    metadata: AuditMetadataSchema.extend({
      checkCount: z.number().int().min(1).max(10),
    }).strict(),
  }).strict(),
  z.object({
    eventType: z.literal('VERIFICATION_FAILED'),
    runId: z.string().trim().min(1).max(128),
    sequence: z.number().int().nonnegative(),
    occurredAt: z.string().datetime(),
    metadata: AuditMetadataSchema.extend({
      failureReason: z.string().trim().min(1).max(200),
    }).strict(),
  }).strict(),
]);

export type AuditEvent = z.infer<typeof AuditEventSchema>;
export type AuditEventType = AuditEvent['eventType'];
