import { z } from 'zod';

import { FixtureIntentExtractor } from '@/ai/intent-extractor';
import { InMemoryDemoRunRepository, type DemoRunRecord, type DemoRunRepository } from '@/domain/demo-run-repository';
import { type ProviderAdapterSet, RunOrchestrator } from '@/domain/run-orchestrator';
import { PostgresDemoRunRepository } from '@/infrastructure/persistence/postgres-demo-run-repository';
import { SqliteDemoRunRepository } from '@/infrastructure/persistence/sqlite-demo-run-repository';

export const DEMO_INSTRUCTION_TEXT = 'Launch the Pro 2027 plan at $129 per seat for new customers only. Northstar and every existing enterprise customer stay grandfathered at $99 per seat. Update our pricing policy and confirm when complete.';
export const DEMO_RUN_CODE = 'AMN-2027-0042';
export const DEMO_APPROVER_USER_ID = 'U_APPROVER';

export const CreateRunBodySchema = z
  .object({
    runId: z.string().trim().min(1).max(128).optional(),
    runCode: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export const ApproveRunBodySchema = z
  .object({
    runCode: z.string().trim().min(1).max(128),
    approvedBy: z.string().trim().min(1).max(128),
    approvalMessage: z.string().trim().min(1).max(128),
  })
  .strict();

export const ResetDemoBodySchema = z
  .object({
    allowReset: z.literal(true),
  })
  .strict();

export const EmptyBodySchema = z.object({}).strict();

export type DemoApiRuntime = {
  repository: DemoRunRepository;
  orchestrator: RunOrchestrator;
  approverUserId: string;
  defaultRunCode: string;
  reset: () => DemoApiRuntime;
};

export function makeLocalMockProviderSet(): ProviderAdapterSet {
  return {
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
        currentRunCode: DEMO_RUN_CODE,
        recoveryReceiptExists: true,
        readAt: '2026-09-13T00:00:00.000Z',
      }),
    },
  };
}

export function createDefaultDemoRunRepository(): DemoRunRepository {
  if (process.env.DATABASE_URL) {
    return new PostgresDemoRunRepository(process.env.DATABASE_URL);
  }

  return new SqliteDemoRunRepository(process.env.AMENDS_DATABASE_PATH ?? './data/amends.sqlite');
}

export function createDemoApiRuntime(overrides?: {
  repository?: DemoRunRepository;
  providers?: ProviderAdapterSet;
  approverUserId?: string;
  defaultRunCode?: string;
}): DemoApiRuntime {
  const repository = overrides?.repository ?? new InMemoryDemoRunRepository();
  const providers = overrides?.providers ?? makeLocalMockProviderSet();
  const approverUserId = overrides?.approverUserId ?? DEMO_APPROVER_USER_ID;
  const defaultRunCode = overrides?.defaultRunCode ?? DEMO_RUN_CODE;

  const orchestrator = new RunOrchestrator({
    extractor: new FixtureIntentExtractor(),
    repository,
    providers,
    approverUserId,
    defaultRunCode,
  });

  const runtime: DemoApiRuntime = {
    repository,
    orchestrator,
    approverUserId,
    defaultRunCode,
    reset: () => createDemoApiRuntime({ providers, approverUserId, defaultRunCode }),
  };

  return runtime;
}

let activeRuntime: DemoApiRuntime | undefined;

export function getDemoRuntime(): DemoApiRuntime {
  if (!activeRuntime) {
    activeRuntime = createDemoApiRuntime({ repository: createDefaultDemoRunRepository() });
  }

  return activeRuntime;
}

export async function resetDemoRuntime(): Promise<DemoApiRuntime> {
  if (!activeRuntime) {
    activeRuntime = createDemoApiRuntime({ repository: createDefaultDemoRunRepository() });
    return activeRuntime;
  }

  const currentRepository = activeRuntime.repository as DemoRunRepository & { reset?: () => void | Promise<void> };
  if (currentRepository && typeof currentRepository.reset === 'function') {
    await currentRepository.reset();
  }

  activeRuntime = createDemoApiRuntime({
    repository: currentRepository,
    providers: makeLocalMockProviderSet(),
    approverUserId: activeRuntime.approverUserId,
    defaultRunCode: activeRuntime.defaultRunCode,
  });
  return activeRuntime;
}

export function setDemoRuntime(runtime: DemoApiRuntime): DemoApiRuntime {
  activeRuntime = runtime;
  return activeRuntime;
}

export function sanitizeRunSnapshot(record: DemoRunRecord) {
  return {
    runId: record.runId,
    runCode: record.runCode,
    currentState: record.currentState,
    exposureCents: record.exposureCents,
    normalizedSnapshots: {
      stripe: record.normalizedSnapshots.stripe
        ? {
            provider: record.normalizedSnapshots.stripe.provider,
            accountMode: record.normalizedSnapshots.stripe.accountMode,
            status: record.normalizedSnapshots.stripe.status,
            unitAmountCents: record.normalizedSnapshots.stripe.unitAmountCents,
            quantity: record.normalizedSnapshots.stripe.quantity,
            readAt: record.normalizedSnapshots.stripe.readAt,
          }
        : null,
      notion: record.normalizedSnapshots.notion
        ? {
            provider: record.normalizedSnapshots.notion.provider,
            accountMode: record.normalizedSnapshots.notion.accountMode,
            scope: record.normalizedSnapshots.notion.scope,
            existingPriceCents: record.normalizedSnapshots.notion.existingPriceCents,
            newCustomerPriceCents: record.normalizedSnapshots.notion.newCustomerPriceCents,
            readAt: record.normalizedSnapshots.notion.readAt,
          }
        : null,
      slack: record.normalizedSnapshots.slack
        ? {
            provider: record.normalizedSnapshots.slack.provider,
            accountMode: record.normalizedSnapshots.slack.accountMode,
            channelId: record.normalizedSnapshots.slack.channelId,
            originalInstructionAvailable: record.normalizedSnapshots.slack.originalInstructionAvailable,
            currentRunCode: record.normalizedSnapshots.slack.currentRunCode,
            recoveryReceiptExists: record.normalizedSnapshots.slack.recoveryReceiptExists,
            readAt: record.normalizedSnapshots.slack.readAt,
          }
        : null,
    },
    mismatches: record.mismatches.map((mismatch) => ({
      provider: mismatch.provider,
      kind: mismatch.kind,
      expected: mismatch.expected,
      actual: mismatch.actual,
    })),
    plan: record.plan
      ? {
          expiresAt: record.plan.expiresAt,
          actions: record.plan.actions.map((action) => ({ type: action.type })),
          preconditions: {
            approvalCode: record.plan.preconditions.approvalCode,
            expiresAt: record.plan.preconditions.expiresAt,
          },
        }
      : null,
    verification: record.verification
      ? {
          passes: record.verification.passes,
          checks: record.verification.checks.map((check) => ({
            passed: check.passed,
            detail: check.detail,
          })),
        }
      : null,
    approvedAt: record.approvedAt,
    approvedBy: record.approvedBy,
    sanitizedFailure: record.sanitizedFailure
      ? {
          code: record.sanitizedFailure.code,
          message: record.sanitizedFailure.message,
          provider: record.sanitizedFailure.provider ?? undefined,
        }
      : null,
  };
}
