import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FixtureIntentExtractor, OpenAIIntentExtractor } from '../ai/intent-extractor';
import { DEFAULT_OUTCOME_CONTRACT, IntentContractV1Schema, verifyRecoveredState } from './orchestration';
import { InMemoryDemoRunRepository } from './demo-run-repository';
import { RunOrchestrator, type ProviderAdapterSet } from './run-orchestrator';
import { assertValidRunTransition } from './run-states';

const canonicalInstruction = 'Launch the Pro 2027 plan at $129 per seat for new customers only. Northstar and every existing enterprise customer stay grandfathered at $99 per seat. Update our pricing policy and confirm when complete.';

function makeFakeProviderSet(overrides?: Record<string, unknown>) {
  const base = {
    stripe: {
      inspect: async () => ({
        provider: 'Stripe',
        customerAlias: 'northstar',
        accountMode: 'TEST',
        subscriptionItemId: 'sub_123',
        grandfatheredPriceId: 'price_99',
        currentPriceId: 'price_129',
        status: 'ACTIVE',
        unitAmountCents: 12_900,
        quantity: 87,
        invoiceFingerprint: null,
        readAt: '2026-09-13T00:00:00.000Z',
      }),
      executeAllowlistedRecovery: async () => ({
        provider: 'Stripe',
        actionType: 'RESTORE_STRIPE_GRANDFATHERED_PRICE',
        status: 'SUCCEEDED',
        resultId: 'stripe-result-1',
        verified: true,
        readAt: '2026-09-13T00:00:00.000Z',
      }),
      verifyReread: async () => ({
        provider: 'Stripe',
        customerAlias: 'northstar',
        accountMode: 'TEST',
        subscriptionItemId: 'sub_123',
        grandfatheredPriceId: 'price_99',
        currentPriceId: 'price_129',
        status: 'ACTIVE',
        unitAmountCents: 9_900,
        quantity: 87,
        invoiceFingerprint: null,
        readAt: '2026-09-13T00:00:00.000Z',
      }),
    },
    notion: {
      inspect: async () => ({
        provider: 'Notion',
        accountMode: 'TEST',
        pageId: 'page_123',
        databaseId: 'db_123',
        scope: 'all_customers',
        existingPriceCents: 12_900,
        newCustomerPriceCents: 12_900,
        propertyIds: {
          scope: 'prop_scope',
          existingPrice: 'prop_existing',
          newCustomerPrice: 'prop_new',
        },
        readAt: '2026-09-13T00:00:00.000Z',
      }),
      executeAllowlistedRecovery: async () => ({
        provider: 'Notion',
        actionType: 'RESTORE_NOTION_PRICING_POLICY',
        status: 'SUCCEEDED',
        resultId: 'notion-result-1',
        verified: true,
        readAt: '2026-09-13T00:00:00.000Z',
      }),
      verifyReread: async () => ({
        provider: 'Notion',
        accountMode: 'TEST',
        pageId: 'page_123',
        databaseId: 'db_123',
        scope: 'new_customers_only',
        existingPriceCents: 9_900,
        newCustomerPriceCents: 12_900,
        propertyIds: {
          scope: 'prop_scope',
          existingPrice: 'prop_existing',
          newCustomerPrice: 'prop_new',
        },
        readAt: '2026-09-13T00:00:00.000Z',
      }),
    },
    slack: {
      inspect: async () => ({
        provider: 'Slack',
        accountMode: 'TEST',
        channelId: 'C123',
        approverUserId: 'U_APPROVER',
        originalInstructionAvailable: true,
        currentRunCode: null,
        recoveryReceiptExists: false,
        readAt: '2026-09-13T00:00:00.000Z',
      }),
      requestApproval: async () => ({
        provider: 'Slack',
        actionType: 'POST_SLACK_RECOVERY_RECEIPT',
        status: 'SUCCEEDED',
        resultId: 'slack-request-1',
        verified: true,
        readAt: '2026-09-13T00:00:00.000Z',
      }),
      postAllowlistedRecoveryReceipt: async () => ({
        provider: 'Slack',
        actionType: 'POST_SLACK_RECOVERY_RECEIPT',
        status: 'SUCCEEDED',
        resultId: 'slack-receipt-1',
        verified: true,
        readAt: '2026-09-13T00:00:00.000Z',
      }),
      verifyReread: async () => ({
        provider: 'Slack',
        accountMode: 'TEST',
        channelId: 'C123',
        approverUserId: 'U_APPROVER',
        originalInstructionAvailable: true,
        currentRunCode: 'RUN-123',
        recoveryReceiptExists: true,
        readAt: '2026-09-13T00:00:00.000Z',
      }),
    },
  } as const;

  const overrideRecord = overrides ?? {};
  return {
    ...base,
    ...overrideRecord,
    stripe: { ...base.stripe, ...((overrideRecord as { stripe?: Record<string, unknown> }).stripe ?? {}) },
    notion: { ...base.notion, ...((overrideRecord as { notion?: Record<string, unknown> }).notion ?? {}) },
    slack: { ...base.slack, ...((overrideRecord as { slack?: Record<string, unknown> }).slack ?? {}) },
  } as ProviderAdapterSet;
}

function makeOrchestrator(overrides?: Record<string, unknown>) {
  const repository = new InMemoryDemoRunRepository();
  const defaultProviders = makeFakeProviderSet();
  const orchestrator = new RunOrchestrator({
    extractor: new FixtureIntentExtractor(),
    repository,
    providers: defaultProviders,
    approverUserId: 'U_APPROVER',
    defaultRunCode: 'RUN-123',
    ...overrides,
  });
  return { orchestrator, repository, providers: defaultProviders };
}

describe('Person A Phase 2 requirements', () => {
  it('rejects malformed model output', async () => {
    const extractor = new OpenAIIntentExtractor({
      extractStructuredIntent: async () => ({ version: 'v2', extra: 'bad' }),
    });

    await assert.rejects(() => extractor.extract(canonicalInstruction), /Malformed model output rejected/);
  });

  it('rejects extra/model-invented fields and provider IDs in model output', () => {
    const parsed = IntentContractV1Schema.safeParse({
      ...DEFAULT_OUTCOME_CONTRACT,
      providerId: 'sub_123',
      extraField: true,
    });
    assert.equal(parsed.success, false);

    const providerIdParsed = IntentContractV1Schema.safeParse({
      ...DEFAULT_OUTCOME_CONTRACT,
      expectedStripe: {
        ...DEFAULT_OUTCOME_CONTRACT.expectedStripe,
        customerAlias: 'some-other-customer',
      },
    });
    assert.equal(providerIdParsed.success, false);
  });

  it('FixtureIntentExtractor performs no network access and uses the locked fallback contract', async () => {
    const extractor = new FixtureIntentExtractor();
    const result = await extractor.extract(canonicalInstruction);
    assert.deepEqual(result, DEFAULT_OUTCOME_CONTRACT);
  });

  it('duplicate run ID is rejected by the repository', () => {
    const repo = new InMemoryDemoRunRepository();
    const record: Parameters<typeof repo.create>[0] = {
      runId: 'run-1',
      runCode: 'RUN-1',
      currentState: 'CREATED',
      contract: DEFAULT_OUTCOME_CONTRACT,
      normalizedSnapshots: { stripe: null, notion: null, slack: null },
      mismatches: [],
      exposureCents: 0,
      plan: null,
      verification: null,
      createdAt: '2026-09-13T00:00:00.000Z',
      updatedAt: '2026-09-13T00:00:00.000Z',
      approvedAt: null,
      approvedBy: null,
      executedActionIds: [],
      sanitizedFailure: null,
    };

    repo.create(record);
    assert.throws(() => repo.create(record), /Duplicate demo run ID rejected/);
  });

  it('invalid run-state transitions are rejected', () => {
    assert.throws(() => assertValidRunTransition('CREATED', 'VERIFIED'), /Illegal run-state transition/);
  });

  it('recovery before approval is rejected', async () => {
    const { orchestrator } = makeOrchestrator();
    const run = await orchestrator.createRun('run-before-approval', 'RUN-1', canonicalInstruction);
    const state = run.currentState;
    assert.equal(state, 'MISMATCH_FOUND');

    const rejected = await orchestrator.executeRecovery('run-before-approval');
    assert.equal(rejected.currentState, 'MANUAL_REVIEW');
  });

  it('wrong approver is rejected', async () => {
    const { orchestrator } = makeOrchestrator();
    await orchestrator.createRun('run-wrong-approver', 'RUN-1', canonicalInstruction);
    await orchestrator.createApprovalPlan('run-wrong-approver', 'RUN-1');
    const result = await orchestrator.approveRun('run-wrong-approver', 'RUN-1', 'U_OTHER', 'APPROVE RUN-1');
    assert.equal(result.currentState, 'APPROVAL_DENIED');
  });

  it('expired plan is rejected', async () => {
    const providers = makeFakeProviderSet();
    const repo = new InMemoryDemoRunRepository();
    const orchestrator = new RunOrchestrator({
      extractor: new FixtureIntentExtractor(),
      repository: repo,
      providers,
      approverUserId: 'U_APPROVER',
      defaultRunCode: 'RUN-1',
    });

    await orchestrator.createRun('run-expired', 'RUN-1', canonicalInstruction);
    await orchestrator.createApprovalPlan('run-expired', 'RUN-1');

    const record = repo.get('run-expired');
    if (!record || !record.plan) {
      throw new Error('Plan missing for expiration test');
    }

    const expiredPlan = {
      ...record.plan,
      expiresAt: '2000-01-01T00:00:00.000Z',
    };
    repo.save({ ...record, plan: expiredPlan } as Parameters<typeof repo.save>[0]);

    const result = await orchestrator.approveRun('run-expired', 'RUN-1', 'U_APPROVER', 'APPROVE RUN-1');
    assert.equal(result.currentState, 'PLAN_EXPIRED');
  });

  it('changed plan hash is rejected', async () => {
    const { orchestrator, repository } = makeOrchestrator();
    await orchestrator.createRun('run-hash', 'RUN-1', canonicalInstruction);
    await orchestrator.createApprovalPlan('run-hash', 'RUN-1');

    const record = repository.get('run-hash');
    if (!record || !record.plan) {
      throw new Error('Plan missing for hash test');
    }

    const mutatedPlan = {
      ...record.plan,
      hash: 'b'.repeat(64),
    };
    repository.save({ ...record, plan: mutatedPlan } as Parameters<typeof repository.save>[0]);

    const result = await orchestrator.approveRun('run-hash', 'RUN-1', 'U_APPROVER', 'APPROVE RUN-1');
    assert.equal(result.currentState, 'MANUAL_REVIEW');
  });

  it('duplicate action execution is prevented', async () => {
    let stripeRecoveryCalls = 0;
    let notionRecoveryCalls = 0;
    let slackRecoveryCalls = 0;

    const { orchestrator, repository } = makeOrchestrator({
      providers: makeFakeProviderSet({
        stripe: {
          executeAllowlistedRecovery: async () => {
            stripeRecoveryCalls += 1;
            return {
              provider: 'Stripe',
              actionType: 'RESTORE_STRIPE_GRANDFATHERED_PRICE',
              status: 'SUCCEEDED',
              resultId: 'stripe-result-1',
              verified: true,
              readAt: '2026-09-13T00:00:00.000Z',
            };
          },
        },
        notion: {
          executeAllowlistedRecovery: async () => {
            notionRecoveryCalls += 1;
            return {
              provider: 'Notion',
              actionType: 'RESTORE_NOTION_PRICING_POLICY',
              status: 'SUCCEEDED',
              resultId: 'notion-result-1',
              verified: true,
              readAt: '2026-09-13T00:00:00.000Z',
            };
          },
        },
        slack: {
          postAllowlistedRecoveryReceipt: async () => {
            slackRecoveryCalls += 1;
            return {
              provider: 'Slack',
              actionType: 'POST_SLACK_RECOVERY_RECEIPT',
              status: 'SUCCEEDED',
              resultId: 'slack-receipt-1',
              verified: true,
              readAt: '2026-09-13T00:00:00.000Z',
            };
          },
          verifyReread: async () => ({
            provider: 'Slack',
            accountMode: 'TEST',
            channelId: 'C123',
            approverUserId: 'U_APPROVER',
            originalInstructionAvailable: true,
            currentRunCode: 'RUN-1',
            recoveryReceiptExists: true,
            readAt: '2026-09-13T00:00:00.000Z',
          }),
        },
      }),
    });

    await orchestrator.createRun('run-duplicate-action', 'RUN-1', canonicalInstruction);
    await orchestrator.createApprovalPlan('run-duplicate-action', 'RUN-1');
    const approved = await orchestrator.approveRun('run-duplicate-action', 'RUN-1', 'U_APPROVER', 'APPROVE RUN-1');
    assert.equal(approved.currentState, 'APPROVED');

    const first = await orchestrator.executeRecovery('run-duplicate-action');
    assert.equal(first.currentState, 'VERIFIED');
    assert.equal(first.sanitizedFailure, null);
    assert.equal(stripeRecoveryCalls, 1);
    assert.equal(notionRecoveryCalls, 1);
    assert.equal(slackRecoveryCalls, 1);

    const afterFirst = repository.get('run-duplicate-action');
    assert.ok(afterFirst);
    assert.equal(afterFirst.currentState, 'VERIFIED');
    assert.equal(afterFirst.executedActionIds.length, 3);

    const second = await orchestrator.executeRecovery('run-duplicate-action');
    assert.equal(second.currentState, 'VERIFIED');
    assert.equal(second.sanitizedFailure?.message, 'RECOVERY_ALREADY_COMPLETED');
    assert.equal(stripeRecoveryCalls, 1);
    assert.equal(notionRecoveryCalls, 1);
    assert.equal(slackRecoveryCalls, 1);

    const afterSecond = repository.get('run-duplicate-action');
    assert.ok(afterSecond);
    assert.equal(afterSecond.currentState, 'VERIFIED');
    assert.equal(afterSecond.executedActionIds.length, 3);
    assert.equal(afterSecond.sanitizedFailure?.message, 'RECOVERY_ALREADY_COMPLETED');
  });

  it('five restored checks pass', () => {
    const result = verifyRecoveredState({
      version: 'v1',
      stripe: {
        provider: 'Stripe',
        customerAlias: 'northstar',
        accountMode: 'TEST',
        status: 'ACTIVE',
        unitAmountCents: 9_900,
        quantity: 87,
        invoiceFingerprint: null,
        readAt: '2026-09-13T00:00:00.000Z',
      },
      notion: {
        provider: 'Notion',
        accountMode: 'TEST',
        scope: 'new_customers_only',
        existingPriceCents: 9_900,
        newCustomerPriceCents: 12_900,
        pageId: 'page_123',
        readAt: '2026-09-13T00:00:00.000Z',
      },
      slack: {
        provider: 'Slack',
        accountMode: 'TEST',
        channelId: 'C123',
        originalInstructionAvailable: true,
        currentRunCode: 'RUN-123',
        recoveryReceiptExists: true,
        readAt: '2026-09-13T00:00:00.000Z',
      },
      readAt: '2026-09-13T00:00:00.000Z',
    }, 'RUN-123');

    assert.equal(result.passes, true);
    assert.equal(result.checks.length, 5);
  });

  it('one incorrect final field causes verification failure', () => {
    const result = verifyRecoveredState({
      version: 'v1',
      stripe: {
        provider: 'Stripe',
        customerAlias: 'northstar',
        accountMode: 'TEST',
        status: 'ACTIVE',
        unitAmountCents: 9_900,
        quantity: 87,
        invoiceFingerprint: null,
        readAt: '2026-09-13T00:00:00.000Z',
      },
      notion: {
        provider: 'Notion',
        accountMode: 'TEST',
        scope: 'new_customers_only',
        existingPriceCents: 9_900,
        newCustomerPriceCents: 12_800,
        pageId: 'page_123',
        readAt: '2026-09-13T00:00:00.000Z',
      },
      slack: {
        provider: 'Slack',
        accountMode: 'TEST',
        channelId: 'C123',
        originalInstructionAvailable: true,
        currentRunCode: 'RUN-123',
        recoveryReceiptExists: true,
        readAt: '2026-09-13T00:00:00.000Z',
      },
      readAt: '2026-09-13T00:00:00.000Z',
    }, 'RUN-123');

    assert.equal(result.passes, false);
  });

  it('adapter rereads occur before final verification', async () => {
    let stripeReads = 0;
    let notionReads = 0;
    let slackReads = 0;
    const { orchestrator } = makeOrchestrator({
      providers: makeFakeProviderSet({
        stripe: {
          verifyReread: async () => {
            stripeReads += 1;
            return {
              provider: 'Stripe',
              customerAlias: 'northstar',
              accountMode: 'TEST',
              subscriptionItemId: 'sub_123',
              grandfatheredPriceId: 'price_99',
              currentPriceId: 'price_129',
              status: 'ACTIVE',
              unitAmountCents: 9_900,
              quantity: 87,
              invoiceFingerprint: null,
              readAt: '2026-09-13T00:00:00.000Z',
            };
          },
        },
        notion: {
          verifyReread: async () => {
            notionReads += 1;
            return {
              provider: 'Notion',
              accountMode: 'TEST',
              pageId: 'page_123',
              databaseId: 'db_123',
              scope: 'new_customers_only',
              existingPriceCents: 9_900,
              newCustomerPriceCents: 12_900,
              propertyIds: {
                scope: 'prop_scope',
                existingPrice: 'prop_existing',
                newCustomerPrice: 'prop_new',
              },
              readAt: '2026-09-13T00:00:00.000Z',
            };
          },
        },
        slack: {
          verifyReread: async () => {
            slackReads += 1;
            return {
              provider: 'Slack',
              accountMode: 'TEST',
              channelId: 'C123',
              approverUserId: 'U_APPROVER',
              originalInstructionAvailable: true,
              currentRunCode: 'RUN-123',
              recoveryReceiptExists: true,
              readAt: '2026-09-13T00:00:00.000Z',
            };
          },
        },
      }),
    });

    await orchestrator.createRun('run-reread-check', 'RUN-123', canonicalInstruction);
    await orchestrator.createApprovalPlan('run-reread-check', 'RUN-123');
    await orchestrator.approveRun('run-reread-check', 'RUN-123', 'U_APPROVER', 'APPROVE RUN-123');
    await orchestrator.executeRecovery('run-reread-check');

    assert.equal(stripeReads, 1);
    assert.equal(notionReads, 1);
    assert.equal(slackReads, 1);
  });

  it('controlled provider failure reaches the correct safe terminal state', async () => {
    const providers = makeFakeProviderSet({
      stripe: {
        executeAllowlistedRecovery: async () => {
          throw new Error('provider timeout');
        },
      },
    });
    const orchestrator = new RunOrchestrator({
      extractor: new FixtureIntentExtractor(),
      repository: new InMemoryDemoRunRepository(),
      providers,
      approverUserId: 'U_APPROVER',
      defaultRunCode: 'RUN-123',
    });

    await orchestrator.createRun('run-failure', 'RUN-123', canonicalInstruction);
    await orchestrator.createApprovalPlan('run-failure', 'RUN-123');
    const approved = await orchestrator.approveRun('run-failure', 'RUN-123', 'U_APPROVER', 'APPROVE RUN-123');
    assert.equal(approved.currentState, 'APPROVED');

    const result = await orchestrator.executeRecovery('run-failure');
    assert.equal(result.currentState, 'MANUAL_REVIEW');
  });
});
