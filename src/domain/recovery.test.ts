import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z } from 'zod';

import {
  ActionExecutionRecordSchema,
  createIdempotencyKey,
  recordFailedExecution,
} from './idempotency';
import {
  RecoveryActionSchema,
  RecoveryPlanV1Schema,
  RecoveryPlanHashPayloadSchema,
  createCanonicalRecoveryPlanHash,
  ensureAllowedRecoveryAction,
  isAllowedRecoveryAction,
} from './recovery';
import { RunStateSchema, assertValidRunTransition, isValidRunTransition } from './run-states';
import { AuditEventSchema } from './audit';
import { NotionProviderStateSchema } from '../providers/contracts/notion';
import { SlackProviderStateSchema } from '../providers/contracts/slack';
import { StripeProviderStateSchema } from '../providers/contracts/stripe';

const validAction = {
  type: 'RESTORE_STRIPE_GRANDFATHERED_PRICE',
  actionId: 'action-stripe-restore-001',
  customerAlias: 'northstar',
  unitAmount: 9900,
  quantity: 87,
} as const;

const validPlanHashPayload = {
  runId: 'run-123',
  actions: [validAction],
  riskLabel: 'MEDIUM',
  reversibility: 'COMPENSATING_ONLY',
  preconditions: {
    runState: 'APPROVED',
    planHash: 'a'.repeat(64),
    approvalCode: 'APPROVE RUN-123',
    actorAllowlist: ['slack-approver'],
    approvedAt: '2026-09-13T00:00:00.000Z',
    expiresAt: '2026-09-14T00:00:00.000Z',
  },
  expiresAt: '2026-09-14T00:00:00.000Z',
  version: 'v1',
} as const;

const validPlan = {
  ...validPlanHashPayload,
  hash: 'b'.repeat(64),
} as const;

describe('Recovery action schemas', () => {
  it('accepts only the allowlisted recovery actions and rejects missing actionId', () => {
    assert.deepEqual(RecoveryActionSchema.parse(validAction), validAction);
    assert.deepEqual(RecoveryActionSchema.parse({
      type: 'RESTORE_NOTION_PRICING_POLICY',
      actionId: 'action-notion-restore-001',
      customerAlias: 'northstar',
      scope: 'new_customers_only',
      existingAmount: 9900,
      newAmount: 12900,
    }), {
      type: 'RESTORE_NOTION_PRICING_POLICY',
      actionId: 'action-notion-restore-001',
      customerAlias: 'northstar',
      scope: 'new_customers_only',
      existingAmount: 9900,
      newAmount: 12900,
    });
    assert.deepEqual(RecoveryActionSchema.parse({
      type: 'POST_SLACK_RECOVERY_RECEIPT',
      actionId: 'action-slack-receipt-001',
      customerAlias: 'northstar',
      runCode: 'RUN-123',
    }), {
      type: 'POST_SLACK_RECOVERY_RECEIPT',
      actionId: 'action-slack-receipt-001',
      customerAlias: 'northstar',
      runCode: 'RUN-123',
    });
    assert.throws(() => RecoveryActionSchema.parse({
      type: 'RESTORE_STRIPE_GRANDFATHERED_PRICE',
      customerAlias: 'northstar',
      unitAmount: 9900,
      quantity: 87,
    } as never), z.ZodError);
  });

  it('rejects unknown provider aliases and action types', () => {
    assert.throws(() => RecoveryActionSchema.parse({
      type: 'RESTORE_STRIPE_GRANDFATHERED_PRICE',
      actionId: 'action-bad-001',
      customerAlias: 'bad-customer',
      unitAmount: 9900,
      quantity: 87,
    }), z.ZodError);

    assert.throws(() => RecoveryActionSchema.parse({
      type: 'UNSAFE_ACTION',
      actionId: 'action-bad-002',
      customerAlias: 'northstar',
      unitAmount: 9900,
      quantity: 87,
    }), z.ZodError);
  });

  it('allows only the canonical allowlist', () => {
    assert.equal(isAllowedRecoveryAction(validAction), true);
    assert.equal(isAllowedRecoveryAction({
      type: 'POST_SLACK_RECOVERY_RECEIPT',
      actionId: 'action-slack-002',
      customerAlias: 'northstar',
      runCode: 'RUN-123',
    }), true);

    assert.doesNotThrow(() => ensureAllowedRecoveryAction({
      type: 'POST_SLACK_RECOVERY_RECEIPT',
      actionId: 'action-slack-003',
      customerAlias: 'northstar',
      runCode: 'RUN-123',
    }));
  });
});

describe('Recovery plan validation and canonical hashing', () => {
  it('accepts a valid plan payload and computes a canonical hash', () => {
    const parsed = RecoveryPlanV1Schema.parse(validPlan);
    assert.equal(parsed.version, 'v1');
    const hash = createCanonicalRecoveryPlanHash(RecoveryPlanHashPayloadSchema.parse(validPlanHashPayload));
    assert.match(hash, /^[a-f0-9]{64}$/);
    assert.notEqual(hash, validPlan.hash);
  });

  it('produces identical hashes across nested key order differences and different hashes for changed values', () => {
    const first = {
      runId: 'run-123',
      actions: [
        {
          type: 'RESTORE_STRIPE_GRANDFATHERED_PRICE',
          actionId: 'action-strip-1',
          customerAlias: 'northstar',
          unitAmount: 9900,
          quantity: 87,
        },
      ],
      riskLabel: 'MEDIUM',
      reversibility: 'COMPENSATING_ONLY',
      preconditions: {
        runState: 'APPROVED',
        planHash: 'a'.repeat(64),
        approvalCode: 'APPROVE RUN-123',
        actorAllowlist: ['slack-approver'],
        approvedAt: '2026-09-13T00:00:00.000Z',
        expiresAt: '2026-09-14T00:00:00.000Z',
      },
      expiresAt: '2026-09-14T00:00:00.000Z',
      version: 'v1',
    } as const;
    const second = {
      version: 'v1',
      expiresAt: '2026-09-14T00:00:00.000Z',
      preconditions: {
        approvedAt: '2026-09-13T00:00:00.000Z',
        approvalCode: 'APPROVE RUN-123',
        actorAllowlist: ['slack-approver'],
        expiresAt: '2026-09-14T00:00:00.000Z',
        planHash: 'a'.repeat(64),
        runState: 'APPROVED',
      },
      reversibility: 'COMPENSATING_ONLY',
      riskLabel: 'MEDIUM',
      runId: 'run-123',
      actions: [
        {
          unitAmount: 9900,
          quantity: 87,
          type: 'RESTORE_STRIPE_GRANDFATHERED_PRICE',
          actionId: 'action-strip-1',
          customerAlias: 'northstar',
        },
      ],
    } as const;

    const hashA = createCanonicalRecoveryPlanHash(RecoveryPlanHashPayloadSchema.parse(first));
    const hashB = createCanonicalRecoveryPlanHash(RecoveryPlanHashPayloadSchema.parse(second));
    assert.equal(hashA, hashB);

    const changed = { ...first, actions: [{ ...first.actions[0], quantity: 88 }] } as const;
    assert.notEqual(hashA, createCanonicalRecoveryPlanHash(RecoveryPlanHashPayloadSchema.parse(changed)));
  });

  it('rejects invalid plan data', () => {
    assert.throws(() => RecoveryPlanV1Schema.parse({
      ...validPlan,
      version: 'v2',
    }), z.ZodError);

    assert.throws(() => RecoveryPlanV1Schema.parse({
      ...validPlan,
      actions: [],
    }), z.ZodError);
  });
});

describe('Run state transitions', () => {
  it('accepts valid transitions and rejects invalid ones', () => {
    assert.equal(isValidRunTransition('CREATED', 'INSPECTING'), true);
    assert.equal(isValidRunTransition('INSPECTING', 'MISMATCH_FOUND'), true);
    assert.equal(isValidRunTransition('CREATED', 'VERIFIED'), false);
    assert.throws(() => assertValidRunTransition('CREATED', 'VERIFIED'), /Illegal run-state transition/);
    assert.equal(RunStateSchema.parse('NO_MISMATCH'), 'NO_MISMATCH');
  });
});

describe('Provider state schemas and adapter result validation', () => {
  it('accepts valid provider states and rejects extra fields or malformed IDs', () => {
    assert.doesNotThrow(() => StripeProviderStateSchema.parse({
      provider: 'Stripe',
      customerAlias: 'northstar',
      accountMode: 'TEST',
      subscriptionItemId: 'sub_123',
      grandfatheredPriceId: 'price_456',
      currentPriceId: 'price_789',
      status: 'ACTIVE',
      unitAmountCents: 9900,
      quantity: 87,
      invoiceFingerprint: 'fp_123',
      readAt: '2026-09-13T00:00:00.000Z',
    }));

    assert.throws(() => NotionProviderStateSchema.parse({
      provider: 'Notion',
      accountMode: 'TEST',
      pageId: 'page 123',
      databaseId: 'db_123',
      scope: 'new_customers_only',
      existingPriceCents: 9900,
      newCustomerPriceCents: 12900,
      propertyIds: {
        scope: 'prop_scope',
        existingPrice: 'prop_existing',
        newCustomerPrice: 'prop_new',
      },
      readAt: '2026-09-13T00:00:00.000Z',
      extra: 'bad',
    }), z.ZodError);

    assert.throws(() => SlackProviderStateSchema.parse({
      provider: 'Slack',
      accountMode: 'TEST',
      channelId: 'channel id',
      approverUserId: 'U123',
      originalInstructionAvailable: true,
      currentRunCode: 'RUN-123',
      recoveryReceiptExists: false,
      readAt: '2026-09-13T00:00:00.000Z',
    }), z.ZodError);
  });
});

describe('Idempotency and attempt limits', () => {
  it('creates deterministic keys and rejects exceeding the attempt limit', () => {
    const keyA = createIdempotencyKey('run-123', 'a'.repeat(64), 'action-001', 'RESTORE_STRIPE_GRANDFATHERED_PRICE');
    const keyB = createIdempotencyKey('run-123', 'a'.repeat(64), 'action-001', 'RESTORE_STRIPE_GRANDFATHERED_PRICE');
    assert.equal(keyA, keyB);
    assert.match(keyA, /^[a-f0-9]{64}$/);

    const record = ActionExecutionRecordSchema.parse({
      runId: 'run-123',
      planHash: 'a'.repeat(64),
      actionId: 'action-001',
      actionType: 'RESTORE_STRIPE_GRANDFATHERED_PRICE',
      idempotencyKey: keyA,
      status: 'PENDING',
      attempts: 3,
      maxAttempts: 3,
      createdAt: '2026-09-13T00:00:00.000Z',
      updatedAt: '2026-09-13T00:00:00.000Z',
      completedAt: null,
      failure: null,
    });
    assert.throws(() => ActionExecutionRecordSchema.parse({
      ...record,
      attempts: 4,
    }), z.ZodError);

    const failed = recordFailedExecution(record, {
      code: 'TIMEOUT',
      message: 'provider timeout',
      provider: 'Stripe',
    });
    assert.equal(failed.status, 'FAILED');
    assert.equal(failed.completedAt !== null, true);
  });
});

describe('Audit rejection and events', () => {
  it('rejects unknown action types and disallowed state values', () => {
    assert.throws(() => AuditEventSchema.parse({
      eventType: 'ACTION_STARTED',
      runId: 'run-123',
      sequence: 1,
      occurredAt: '2026-09-13T00:00:00.000Z',
      metadata: {
        actionType: 'UNSAFE_ACTION',
        idempotencyKey: 'k',
        state: 'CREATED',
      },
    }), z.ZodError);

    assert.throws(() => AuditEventSchema.parse({
      eventType: 'APPROVAL_GRANTED',
      runId: 'run-123',
      sequence: 1,
      occurredAt: '2026-09-13T00:00:00.000Z',
      metadata: {
        runCode: 'RUN-123',
        approvedBy: 'U_123',
        state: 'NOPE' as never,
      },
    }), z.ZodError);
  });
});
