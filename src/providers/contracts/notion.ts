import { z } from 'zod';

import { RecoveryActionTypeSchema } from '../../domain/recovery';

export const NotionProviderIdSchema = z.string().trim().min(1).max(255).refine((value) => !value.includes(' '), {
  message: 'Notion IDs must not contain whitespace',
});

export const NotionProviderStateSchema = z
  .object({
    provider: z.literal('Notion'),
    accountMode: z.enum(['TEST', 'LIVE']),
    pageId: NotionProviderIdSchema,
    databaseId: NotionProviderIdSchema,
    scope: z.enum(['new_customers_only', 'all_customers']),
    existingPriceCents: z.number().int().nonnegative().max(1_000_000),
    newCustomerPriceCents: z.number().int().nonnegative().max(1_000_000),
    propertyIds: z
      .object({
        scope: NotionProviderIdSchema,
        existingPrice: NotionProviderIdSchema,
        newCustomerPrice: NotionProviderIdSchema,
      })
      .strict(),
    readAt: z.string().datetime(),
  })
  .strict();

export type NotionProviderState = z.infer<typeof NotionProviderStateSchema>;
export type NotionProviderId = z.infer<typeof NotionProviderIdSchema>;

export const NotionInspectionInputSchema = z
  .object({
    provider: z.literal('Notion'),
    accountMode: z.enum(['TEST', 'LIVE']),
    pageId: NotionProviderIdSchema,
    readAt: z.string().datetime().optional(),
  })
  .strict();

export const NotionExecutionContextSchema = z
  .object({
    runId: z.string().trim().min(1).max(128),
    actionId: z.string().trim().min(1).max(128),
    planHash: z.string().trim().regex(/^[a-f0-9]{64}$/),
    idempotencyKey: z.string().trim().min(1).max(128),
    approvedAt: z.string().datetime(),
    accountMode: z.enum(['TEST', 'LIVE']),
  })
  .strict();

export type NotionExecutionContext = z.infer<typeof NotionExecutionContextSchema>;

export const NotionSanitizedResultSchema = z
  .object({
    provider: z.literal('Notion'),
    actionType: RecoveryActionTypeSchema,
    status: z.enum(['SUCCEEDED', 'SKIPPED', 'FAILED']),
    resultId: z.string().trim().min(1).max(128),
    verified: z.boolean(),
    readAt: z.string().datetime(),
  })
  .strict();

export type NotionSanitizedResult = z.infer<typeof NotionSanitizedResultSchema>;

export interface NotionProviderAdapter {
  inspect(input: z.infer<typeof NotionInspectionInputSchema>): Promise<NotionProviderState>;
  executeAllowlistedRecovery(context: NotionExecutionContext): Promise<NotionSanitizedResult>;
  verifyReread(input: z.infer<typeof NotionInspectionInputSchema>): Promise<NotionProviderState>;
}
