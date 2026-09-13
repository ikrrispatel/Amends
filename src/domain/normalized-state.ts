import { z } from 'zod';

export const StripeNormalizedStateSchema = z
  .object({
    provider: z.literal('Stripe'),
    customerAlias: z.literal('northstar'),
    accountMode: z.enum(['TEST', 'LIVE']),
    status: z.enum(['ACTIVE', 'INACTIVE']),
    unitAmountCents: z.number().int().nonnegative().max(1_000_000),
    quantity: z.number().int().nonnegative().max(10_000),
    invoiceFingerprint: z.string().trim().max(128).nullable().default(null),
    readAt: z.string().datetime(),
  })
  .strict();

export const NotionNormalizedStateSchema = z
  .object({
    provider: z.literal('Notion'),
    accountMode: z.enum(['TEST', 'LIVE']),
    scope: z.enum(['new_customers_only', 'all_customers']),
    existingPriceCents: z.number().int().nonnegative().max(1_000_000),
    newCustomerPriceCents: z.number().int().nonnegative().max(1_000_000),
    pageId: z.string().trim().max(128),
    readAt: z.string().datetime(),
  })
  .strict();

export const SlackNormalizedStateSchema = z
  .object({
    provider: z.literal('Slack'),
    accountMode: z.enum(['TEST', 'LIVE']),
    channelId: z.string().trim().max(128),
    originalInstructionAvailable: z.boolean(),
    currentRunCode: z.string().trim().max(128).nullable().default(null),
    recoveryReceiptExists: z.boolean(),
    readAt: z.string().datetime(),
  })
  .strict();

export const NormalizedStateV1Schema = z
  .object({
    version: z.literal('v1'),
    stripe: StripeNormalizedStateSchema,
    notion: NotionNormalizedStateSchema,
    slack: SlackNormalizedStateSchema,
    readAt: z.string().datetime(),
  })
  .strict();

export type StripeNormalizedState = z.infer<typeof StripeNormalizedStateSchema>;
export type NotionNormalizedState = z.infer<typeof NotionNormalizedStateSchema>;
export type SlackNormalizedState = z.infer<typeof SlackNormalizedStateSchema>;
export type NormalizedStateV1 = z.infer<typeof NormalizedStateV1Schema>;
