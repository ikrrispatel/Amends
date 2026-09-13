import { z } from 'zod';

import { RecoveryActionTypeSchema } from '../../domain/recovery';

export const StripeProviderIdSchema = z.string().trim().min(1).max(255);

export const StripeProviderStateSchema = z
  .object({
    provider: z.literal('Stripe'),
    customerAlias: z.literal('northstar'),
    accountMode: z.enum(['TEST', 'LIVE']),
    subscriptionItemId: StripeProviderIdSchema,
    grandfatheredPriceId: StripeProviderIdSchema,
    currentPriceId: StripeProviderIdSchema,
    status: z.enum(['ACTIVE', 'INACTIVE']),
    unitAmountCents: z.number().int().nonnegative().max(1_000_000),
    quantity: z.number().int().min(1).max(10_000),
    invoiceFingerprint: z.string().trim().max(128).nullable().default(null),
    readAt: z.string().datetime(),
  })
  .strict();

export type StripeProviderState = z.infer<typeof StripeProviderStateSchema>;
export type StripeProviderId = z.infer<typeof StripeProviderIdSchema>;

export const StripeInspectionInputSchema = z
  .object({
    provider: z.literal('Stripe'),
    customerAlias: z.literal('northstar'),
    accountMode: z.enum(['TEST', 'LIVE']),
    readAt: z.string().datetime().optional(),
  })
  .strict();

export const StripeExecutionContextSchema = z
  .object({
    runId: z.string().trim().min(1).max(128),
    actionId: z.string().trim().min(1).max(128),
    planHash: z.string().trim().regex(/^[a-f0-9]{64}$/),
    idempotencyKey: z.string().trim().min(1).max(128),
    approvedAt: z.string().datetime(),
    customerAlias: z.literal('northstar'),
    accountMode: z.enum(['TEST', 'LIVE']),
  })
  .strict();

export type StripeExecutionContext = z.infer<typeof StripeExecutionContextSchema>;

export const StripeSanitizedResultSchema = z
  .object({
    provider: z.literal('Stripe'),
    actionType: RecoveryActionTypeSchema,
    status: z.enum(['SUCCEEDED', 'SKIPPED', 'FAILED']),
    resultId: z.string().trim().min(1).max(128),
    verified: z.boolean(),
    readAt: z.string().datetime(),
  })
  .strict();

export type StripeSanitizedResult = z.infer<typeof StripeSanitizedResultSchema>;

export interface StripeProviderAdapter {
  inspect(input: z.infer<typeof StripeInspectionInputSchema>): Promise<StripeProviderState>;
  executeAllowlistedRecovery(context: StripeExecutionContext): Promise<StripeSanitizedResult>;
  verifyReread(input: z.infer<typeof StripeInspectionInputSchema>): Promise<StripeProviderState>;
}
