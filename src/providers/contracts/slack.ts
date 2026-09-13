import { z } from 'zod';

import { RecoveryActionTypeSchema } from '../../domain/recovery';

export const SlackProviderIdSchema = z.string().trim().min(1).max(255).refine((value) => !value.includes(' '), {
  message: 'Slack IDs must not contain whitespace',
});

export const SlackProviderStateSchema = z
  .object({
    provider: z.literal('Slack'),
    accountMode: z.enum(['TEST', 'LIVE']),
    channelId: SlackProviderIdSchema,
    approverUserId: SlackProviderIdSchema,
    originalInstructionAvailable: z.boolean(),
    currentRunCode: z.string().trim().max(128).nullable().default(null),
    recoveryReceiptExists: z.boolean(),
    readAt: z.string().datetime(),
  })
  .strict();

export type SlackProviderState = z.infer<typeof SlackProviderStateSchema>;
export type SlackProviderId = z.infer<typeof SlackProviderIdSchema>;

export const SlackInspectionInputSchema = z
  .object({
    provider: z.literal('Slack'),
    accountMode: z.enum(['TEST', 'LIVE']),
    channelId: SlackProviderIdSchema,
    readAt: z.string().datetime().optional(),
  })
  .strict();

export const SlackApprovalRequestInputSchema = z
  .object({
    runId: z.string().trim().min(1).max(128),
    runCode: z.string().trim().min(1).max(128),
    approvalCommand: z.literal('APPROVE'),
    approverUserId: SlackProviderIdSchema,
    expiresAt: z.string().datetime(),
  })
  .strict();

export const SlackReceiptInputSchema = z
  .object({
    runId: z.string().trim().min(1).max(128),
    runCode: z.string().trim().min(1).max(128),
    approvedAt: z.string().datetime(),
    actionType: RecoveryActionTypeSchema,
    channelId: SlackProviderIdSchema,
  })
  .strict();

export const SlackSanitizedResultSchema = z
  .object({
    provider: z.literal('Slack'),
    actionType: RecoveryActionTypeSchema,
    status: z.enum(['SUCCEEDED', 'SKIPPED', 'FAILED']),
    resultId: z.string().trim().min(1).max(128),
    verified: z.boolean(),
    readAt: z.string().datetime(),
  })
  .strict();

export type SlackSanitizedResult = z.infer<typeof SlackSanitizedResultSchema>;

export interface SlackProviderAdapter {
  inspect(input: z.infer<typeof SlackInspectionInputSchema>): Promise<SlackProviderState>;
  requestApproval(input: z.infer<typeof SlackApprovalRequestInputSchema>): Promise<SlackSanitizedResult>;
  postAllowlistedRecoveryReceipt(input: z.infer<typeof SlackReceiptInputSchema>): Promise<SlackSanitizedResult>;
  verifyReread(input: z.infer<typeof SlackInspectionInputSchema>): Promise<SlackProviderState>;
}
