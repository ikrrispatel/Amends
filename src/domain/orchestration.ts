import { createHash } from 'node:crypto';
import { z } from 'zod';

import { type NormalizedStateV1 } from './normalized-state';
import {
  RecoveryPlanHashPayloadSchema,
  RecoveryPlanV1Schema,
  type RecoveryAction,
  type RecoveryPlanV1,
  createCanonicalRecoveryPlanHash,
} from './recovery';

export const CANONICAL_SLACK_INSTRUCTION = [
  'Launch the Pro 2027 plan at $129 per seat for new customers only.',
  'Northstar and every existing enterprise customer stay grandfathered at $99 per seat.',
  'Update our pricing policy and confirm when complete.',
].join(' ');

export const OutcomeContractV1Schema = z
  .object({
    version: z.literal('v1'),
    instructionEvidence: z
      .object({
        source: z.literal('Slack'),
        text: z.string().trim().min(1).max(2000),
      })
      .strict(),
    customerAlias: z.literal('northstar'),
    currency: z.literal('USD'),
    expectedStripe: z
      .object({
        customerAlias: z.literal('northstar'),
        status: z.literal('ACTIVE'),
        unitAmountCents: z.number().int().positive().max(1_000_000),
        quantity: z.number().int().min(1).max(10_000),
      })
      .strict(),
    expectedNotion: z
      .object({
        scope: z.literal('new_customers_only'),
        existingPriceCents: z.number().int().positive().max(1_000_000),
        newCustomerPriceCents: z.number().int().positive().max(1_000_000),
      })
      .strict(),
    permittedCommunicationOutcome: z.literal('original_instruction_remains_available'),
  })
  .strict();

export const IntentContractV1Schema = OutcomeContractV1Schema;
export type OutcomeContractV1 = z.infer<typeof OutcomeContractV1Schema>;
export type IntentContractV1 = OutcomeContractV1;

export const DEFAULT_OUTCOME_CONTRACT: OutcomeContractV1 = {
  version: 'v1',
  instructionEvidence: {
    source: 'Slack',
    text: CANONICAL_SLACK_INSTRUCTION,
  },
  customerAlias: 'northstar',
  currency: 'USD',
  expectedStripe: {
    customerAlias: 'northstar',
    status: 'ACTIVE',
    unitAmountCents: 9_900,
    quantity: 87,
  },
  expectedNotion: {
    scope: 'new_customers_only',
    existingPriceCents: 9_900,
    newCustomerPriceCents: 12_900,
  },
  permittedCommunicationOutcome: 'original_instruction_remains_available',
};

export function extractIntentContract(rawInstruction: string, modelOutput?: unknown): IntentContractV1 {
  const normalized = rawInstruction.trim();
  const looksLikeCanonicalInstruction =
    normalized.includes('Northstar') &&
    normalized.includes('$129') &&
    normalized.includes('new customers only') &&
    normalized.includes('grandfathered');

  if (modelOutput === undefined || modelOutput === null) {
    if (!looksLikeCanonicalInstruction) {
      throw new Error('MANUAL_REVIEW');
    }

    return DEFAULT_OUTCOME_CONTRACT;
  }

  const parsed = OutcomeContractV1Schema.safeParse(modelOutput);
  if (!parsed.success) {
    throw new Error('MANUAL_REVIEW');
  }

  return parsed.data;
}

export const BusinessMismatchSchema = z
  .object({
    provider: z.enum(['Stripe', 'Notion']),
    kind: z.enum(['STRIPE_UNIT_PRICE', 'NOTION_PRICING_POLICY']),
    expected: z
      .object({
        customerAlias: z.literal('northstar').optional(),
        status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
        scope: z.enum(['new_customers_only', 'all_customers']).optional(),
        unitAmountCents: z.number().int().nonnegative().optional(),
        existingPriceCents: z.number().int().nonnegative().optional(),
        newCustomerPriceCents: z.number().int().nonnegative().optional(),
        quantity: z.number().int().nonnegative().optional(),
      })
      .strict(),
    actual: z
      .object({
        customerAlias: z.literal('northstar').optional(),
        status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
        scope: z.enum(['new_customers_only', 'all_customers']).optional(),
        unitAmountCents: z.number().int().nonnegative().optional(),
        existingPriceCents: z.number().int().nonnegative().optional(),
        newCustomerPriceCents: z.number().int().nonnegative().optional(),
        quantity: z.number().int().nonnegative().optional(),
      })
      .strict(),
  })
  .strict();

export type BusinessMismatch = z.infer<typeof BusinessMismatchSchema>;

export function compareContractToNormalizedState(
  contract: OutcomeContractV1,
  actual: NormalizedStateV1,
): BusinessMismatch[] {
  const mismatches: BusinessMismatch[] = [];

  if (
    actual.stripe.unitAmountCents !== contract.expectedStripe.unitAmountCents ||
    actual.stripe.status !== contract.expectedStripe.status
  ) {
    mismatches.push({
      provider: 'Stripe',
      kind: 'STRIPE_UNIT_PRICE',
      expected: {
        customerAlias: 'northstar',
        status: contract.expectedStripe.status,
        unitAmountCents: contract.expectedStripe.unitAmountCents,
        quantity: contract.expectedStripe.quantity,
      },
      actual: {
        customerAlias: actual.stripe.customerAlias,
        status: actual.stripe.status,
        unitAmountCents: actual.stripe.unitAmountCents,
        quantity: actual.stripe.quantity,
      },
    });
  }

  if (
    actual.notion.scope !== contract.expectedNotion.scope ||
    actual.notion.existingPriceCents !== contract.expectedNotion.existingPriceCents ||
    actual.notion.newCustomerPriceCents !== contract.expectedNotion.newCustomerPriceCents
  ) {
    mismatches.push({
      provider: 'Notion',
      kind: 'NOTION_PRICING_POLICY',
      expected: {
        scope: contract.expectedNotion.scope,
        existingPriceCents: contract.expectedNotion.existingPriceCents,
        newCustomerPriceCents: contract.expectedNotion.newCustomerPriceCents,
      },
      actual: {
        scope: actual.notion.scope,
        existingPriceCents: actual.notion.existingPriceCents,
        newCustomerPriceCents: actual.notion.newCustomerPriceCents,
      },
    });
  }

  return mismatches;
}

export function calculateExposureCents(
  contract: OutcomeContractV1,
  actual: NormalizedStateV1,
): number {
  const delta = Math.max(0, actual.stripe.unitAmountCents - contract.expectedStripe.unitAmountCents);
  return delta * contract.expectedStripe.quantity;
}

function buildCanonicalPlanHashSeed(runId: string, actions: RecoveryAction[]): string {
  const typed: unknown[] = actions.map((action) => ({ ...action }));
  return createHash('sha256')
    .update(`${runId}:${JSON.stringify(typed)}`)
    .digest('hex');
}

export function buildRecoveryPlan(
  runId: string,
  runCode: string,
  approvedAt: string,
  expiresAt: string,
  actions: RecoveryAction[],
): RecoveryPlanV1 {
  const preconditionHash = buildCanonicalPlanHashSeed(runId, actions);
  const payload = RecoveryPlanHashPayloadSchema.parse({
    runId,
    actions,
    riskLabel: 'MEDIUM',
    reversibility: 'COMPENSATING_ONLY',
    preconditions: {
      runState: 'APPROVED',
      planHash: preconditionHash,
      approvalCode: `APPROVE ${runCode}`,
      actorAllowlist: ['slack-approver'],
      approvedAt,
      expiresAt,
    },
    expiresAt,
    version: 'v1',
  });

  const hash = createCanonicalRecoveryPlanHash(payload);

  const plan = RecoveryPlanV1Schema.parse({
    ...payload,
    hash,
  });

  return plan;
}

export function createDefaultRecoveryActions(runCode: string): RecoveryAction[] {
  return [
    {
      type: 'RESTORE_STRIPE_GRANDFATHERED_PRICE',
      actionId: `${runCode}-stripe-restore`,
      customerAlias: 'northstar',
      unitAmount: 9_900,
      quantity: 87,
    },
    {
      type: 'RESTORE_NOTION_PRICING_POLICY',
      actionId: `${runCode}-notion-restore`,
      customerAlias: 'northstar',
      scope: 'new_customers_only',
      existingAmount: 9_900,
      newAmount: 12_900,
    },
    {
      type: 'POST_SLACK_RECOVERY_RECEIPT',
      actionId: `${runCode}-slack-receipt`,
      customerAlias: 'northstar',
      runCode,
    },
  ];
}

export type VerificationCheck = {
  id: string;
  passed: boolean;
  detail: string;
};

export function verifyRecoveredState(actual: NormalizedStateV1, runCode: string): {
  passes: boolean;
  checks: VerificationCheck[];
} {
  const checks: VerificationCheck[] = [
    {
      id: 'stripe-unit-amount',
      passed: actual.stripe.unitAmountCents === 9_900 && actual.stripe.status === 'ACTIVE',
      detail: 'Stripe Northstar pricing restored to $99/seat while the subscription remains active.',
    },
    {
      id: 'stripe-quantity-and-proration',
      passed: actual.stripe.quantity === 87 && actual.stripe.invoiceFingerprint === null,
      detail: 'Stripe quantity is 87 and no new proration fingerprint was created.',
    },
    {
      id: 'notion-scope',
      passed: actual.notion.scope === 'new_customers_only',
      detail: 'Notion scope is restricted to new customers only.',
    },
    {
      id: 'notion-pricing',
      passed:
        actual.notion.existingPriceCents === 9_900 &&
        actual.notion.newCustomerPriceCents === 12_900,
      detail: 'Notion stores the grandfathered and new-customer price values exactly as required.',
    },
    {
      id: 'slack-receipt',
      passed: actual.slack.recoveryReceiptExists && actual.slack.currentRunCode === runCode,
      detail: 'Current-run recovery receipt exists and references the approved run.',
    },
  ];

  return {
    passes: checks.every((check) => check.passed),
    checks,
  };
}
