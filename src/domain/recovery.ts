import { createHash } from 'node:crypto';
import { z } from 'zod';

const ProviderAliasSchema = z.literal('northstar');

export const RECOVERY_ACTION_TYPES = [
  'RESTORE_STRIPE_GRANDFATHERED_PRICE',
  'RESTORE_NOTION_PRICING_POLICY',
  'POST_SLACK_RECOVERY_RECEIPT',
] as const;

export const RecoveryActionTypeSchema = z.enum(RECOVERY_ACTION_TYPES);
export type RecoveryActionType = z.infer<typeof RecoveryActionTypeSchema>;

export const RecoveryActionIdSchema = z.string().trim().min(1).max(128);

export const RecoveryActionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('RESTORE_STRIPE_GRANDFATHERED_PRICE'),
    actionId: RecoveryActionIdSchema,
    customerAlias: ProviderAliasSchema,
    unitAmount: z.number().int().positive().max(1_000_000),
    quantity: z.number().int().min(1).max(10_000),
  }).strict(),
  z.object({
    type: z.literal('RESTORE_NOTION_PRICING_POLICY'),
    actionId: RecoveryActionIdSchema,
    customerAlias: ProviderAliasSchema,
    scope: z.literal('new_customers_only'),
    existingAmount: z.number().int().positive().max(1_000_000),
    newAmount: z.number().int().positive().max(1_000_000),
  }).strict(),
  z.object({
    type: z.literal('POST_SLACK_RECOVERY_RECEIPT'),
    actionId: RecoveryActionIdSchema,
    customerAlias: ProviderAliasSchema,
    runCode: z.string().trim().min(1).max(128),
  }).strict(),
]);

export type RecoveryAction = z.infer<typeof RecoveryActionSchema>;

export const RecoveryPreconditionSchema = z
  .object({
    runState: z.enum([
      'MISMATCH_FOUND',
      'APPROVAL_PENDING',
      'APPROVED',
      'RECOVERING',
      'VERIFYING',
    ]),
    planHash: z.string().trim().regex(/^[a-f0-9]{64}$/),
    approvalCode: z.string().trim().min(1).max(128),
    actorAllowlist: z.array(z.literal('slack-approver')).max(10),
    approvedAt: z.string().datetime(),
    expiresAt: z.string().datetime(),
  })
  .strict();

export type RecoveryPrecondition = z.infer<typeof RecoveryPreconditionSchema>;

export const RecoveryPlanHashPayloadSchema = z
  .object({
    runId: z.string().trim().min(1).max(128),
    actions: z.array(RecoveryActionSchema).min(1).max(10),
    riskLabel: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
    reversibility: z.enum(['COMPENSATING_ONLY', 'IRREVERSIBLE']).default('COMPENSATING_ONLY'),
    preconditions: RecoveryPreconditionSchema,
    expiresAt: z.string().datetime(),
    version: z.literal('v1'),
  })
  .strict();

export type RecoveryPlanHashPayload = z.infer<typeof RecoveryPlanHashPayloadSchema>;

export const RecoveryPlanV1Schema = RecoveryPlanHashPayloadSchema.extend({
  hash: z.string().trim().regex(/^[a-f0-9]{64}$/),
}).strict();

export type RecoveryPlanV1 = z.infer<typeof RecoveryPlanV1Schema>;

export const RECOVERY_ACTION_ALLOWLIST = new Set<RecoveryActionType>([
  'RESTORE_STRIPE_GRANDFATHERED_PRICE',
  'RESTORE_NOTION_PRICING_POLICY',
  'POST_SLACK_RECOVERY_RECEIPT',
]);

export function isAllowedRecoveryAction(action: RecoveryAction): boolean {
  return RECOVERY_ACTION_ALLOWLIST.has(action.type);
}

export function ensureAllowedRecoveryAction(action: RecoveryAction): RecoveryAction {
  if (!isAllowedRecoveryAction(action)) {
    throw new Error(`Forbidden recovery action: ${action.type}`);
  }

  return action;
}

function canonicalizeForHash(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalizeForHash(entry)).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalizeForHash(entryValue)}`)
      .join(',')}}`;
  }

  throw new Error(`Unsupported value type for canonical hash: ${typeof value}`);
}

export function createCanonicalRecoveryPlanHash(payload: RecoveryPlanHashPayload): string {
  return createHash('sha256').update(canonicalizeForHash(payload), 'utf8').digest('hex');
}
