import { type IntentExtractor } from '../ai/intent-extractor';
import {
  type OutcomeContractV1,
  buildRecoveryPlan,
  compareContractToNormalizedState,
  createDefaultRecoveryActions,
  calculateExposureCents,
  verifyRecoveredState,
} from './orchestration';
import { createCanonicalRecoveryPlanHash } from './recovery';
import { assertValidRunTransition } from './run-states';
import {
  createIdempotencyKey,
  SanitizedFailureSchema,
  type SanitizedFailure,
} from './idempotency';
import { type DemoRunRepository, DemoRunRecordSchema, type DemoRunRecord, createDemoRunRecord } from './demo-run-repository';
import { type RecoveryAction } from './recovery';
import { type RunState } from './run-states';
import { type StripeProviderState, type StripeSanitizedResult } from '../providers/contracts/stripe';
import { type NotionProviderState, type NotionSanitizedResult } from '../providers/contracts/notion';
import { type SlackProviderState, type SlackSanitizedResult } from '../providers/contracts/slack';

export const ORCHESTRATOR_ACCOUNT_MODE = 'TEST' as const;

export type ProviderInspectResult = {
  stripe: StripeProviderState;
  notion: NotionProviderState;
  slack: SlackProviderState;
};

export interface ProviderAdapterSet {
  stripe: {
    inspect: (input: { provider: 'Stripe'; customerAlias: 'northstar'; accountMode: 'TEST' | 'LIVE'; readAt?: string }) => Promise<StripeProviderState>;
    executeAllowlistedRecovery: (context: {
      runId: string;
      actionId: string;
      planHash: string;
      idempotencyKey: string;
      approvedAt: string;
      customerAlias: 'northstar';
      accountMode: 'TEST' | 'LIVE';
    }) => Promise<StripeSanitizedResult>;
    verifyReread: (input: { provider: 'Stripe'; customerAlias: 'northstar'; accountMode: 'TEST' | 'LIVE'; readAt?: string }) => Promise<StripeProviderState>;
  };
  notion: {
    inspect: (input: { provider: 'Notion'; accountMode: 'TEST' | 'LIVE'; pageId: string; readAt?: string }) => Promise<NotionProviderState>;
    executeAllowlistedRecovery: (context: {
      runId: string;
      actionId: string;
      planHash: string;
      idempotencyKey: string;
      approvedAt: string;
      accountMode: 'TEST' | 'LIVE';
    }) => Promise<NotionSanitizedResult>;
    verifyReread: (input: { provider: 'Notion'; accountMode: 'TEST' | 'LIVE'; pageId: string; readAt?: string }) => Promise<NotionProviderState>;
  };
  slack: {
    inspect: (input: { provider: 'Slack'; accountMode: 'TEST' | 'LIVE'; channelId: string; readAt?: string }) => Promise<SlackProviderState>;
    requestApproval: (input: {
      runId: string;
      runCode: string;
      approvalCommand: 'APPROVE';
      approverUserId: string;
      expiresAt: string;
    }) => Promise<SlackSanitizedResult>;
    postAllowlistedRecoveryReceipt: (input: {
      runId: string;
      runCode: string;
      approvedAt: string;
      actionType: RecoveryAction['type'];
      channelId: string;
    }) => Promise<SlackSanitizedResult>;
    verifyReread: (input: { provider: 'Slack'; accountMode: 'TEST' | 'LIVE'; channelId: string; readAt?: string }) => Promise<SlackProviderState>;
  };
}

export interface RunOrchestratorConfig {
  extractor: IntentExtractor;
  repository: DemoRunRepository;
  providers: ProviderAdapterSet;
  approverUserId: string;
  defaultRunCode: string;
}

export class RunOrchestrator {
  constructor(private readonly config: RunOrchestratorConfig) {}

  public async createRun(runId: string, runCode: string, rawInstruction: string): Promise<DemoRunRecord> {
    if (this.config.repository.get(runId)) {
      throw new Error(`Duplicate demo run ID rejected: ${runId}`);
    }

    const contract = await this.config.extractor.extract(rawInstruction);
    const initial = createDemoRunRecord({
      runId,
      runCode,
      currentState: 'CREATED',
      contract,
      normalizedSnapshots: {
        stripe: null,
        notion: null,
        slack: null,
      },
      mismatches: [],
      exposureCents: 0,
      plan: null,
      verification: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const saved = this.config.repository.create(initial);
    return this.inspectRun(saved.runId);
  }

  public async inspectRun(runId: string): Promise<DemoRunRecord> {
    let record = this.config.repository.get(runId);
    if (!record) {
      throw new Error(`Unknown run: ${runId}`);
    }

    try {
      const nextState = record.currentState === 'CREATED' ? 'INSPECTING' : record.currentState;
      assertValidRunTransition(record.currentState, nextState);
      record = { ...record, currentState: nextState, updatedAt: new Date().toISOString() };

      const stripe = await this.config.providers.stripe.inspect({
        provider: 'Stripe',
        customerAlias: 'northstar',
        accountMode: ORCHESTRATOR_ACCOUNT_MODE,
      });
      const notion = await this.config.providers.notion.inspect({
        provider: 'Notion',
        accountMode: ORCHESTRATOR_ACCOUNT_MODE,
        pageId: 'page_123',
      });
      const slack = await this.config.providers.slack.inspect({
        provider: 'Slack',
        accountMode: ORCHESTRATOR_ACCOUNT_MODE,
        channelId: 'C123',
      });

      if (stripe.accountMode !== 'TEST' || notion.accountMode !== 'TEST' || slack.accountMode !== 'TEST') {
        throw new Error('Only TEST account mode is allowed for the demo.');
      }

      const normalized = {
        version: 'v1',
        stripe: {
          provider: 'Stripe',
          customerAlias: stripe.customerAlias,
          accountMode: stripe.accountMode,
          status: stripe.status,
          unitAmountCents: stripe.unitAmountCents,
          quantity: stripe.quantity,
          invoiceFingerprint: stripe.invoiceFingerprint,
          readAt: stripe.readAt,
        },
        notion: {
          provider: 'Notion',
          accountMode: notion.accountMode,
          scope: notion.scope,
          existingPriceCents: notion.existingPriceCents,
          newCustomerPriceCents: notion.newCustomerPriceCents,
          pageId: notion.pageId,
          readAt: notion.readAt,
        },
        slack: {
          provider: 'Slack',
          accountMode: slack.accountMode,
          channelId: slack.channelId,
          originalInstructionAvailable: slack.originalInstructionAvailable,
          currentRunCode: slack.currentRunCode,
          recoveryReceiptExists: slack.recoveryReceiptExists,
          readAt: slack.readAt,
        },
        readAt: new Date().toISOString(),
      } as const;

      const mismatches = compareContractToNormalizedState(record.contract as OutcomeContractV1, normalized);
      const exposure = calculateExposureCents(record.contract as OutcomeContractV1, normalized);

      record = {
        ...record,
        normalizedSnapshots: {
          stripe: normalized.stripe,
          notion: normalized.notion,
          slack: normalized.slack,
        },
        mismatches,
        exposureCents: exposure,
        updatedAt: new Date().toISOString(),
        sanitizedFailure: null,
      };

      if (mismatches.length === 0) {
        record = this.transitionState(record, 'NO_MISMATCH');
      } else {
        record = this.transitionState(record, 'MISMATCH_FOUND');
      }

      return this.config.repository.save(record);
    } catch (error) {
      const failure = this.toSanitizedFailure(error, 'INSPECTION_FAILED');
      const terminalState = this.safeFailureState(record.currentState, 'INSPECTION_FAILED');
      const failed = this.transitionState(
        { ...record, sanitizedFailure: failure, updatedAt: new Date().toISOString() },
        terminalState,
      );
      return this.config.repository.save(failed);
    }
  }

  public async createApprovalPlan(runId: string, runCode: string): Promise<DemoRunRecord> {
    let record = this.config.repository.get(runId);
    if (!record) {
      throw new Error(`Unknown run: ${runId}`);
    }

    if (record.runCode !== runCode) {
      throw new Error(`Run code mismatch for run ${runId}.`);
    }

    if (record.currentState !== 'MISMATCH_FOUND') {
      throw new Error('Approval plan requires a mismatch to have been found.');
    }

    const approvedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const actions = createDefaultRecoveryActions(runCode);
    const plan = buildRecoveryPlan(record.runId, runCode, approvedAt, expiresAt, actions);

    record = {
      ...record,
      runCode,
      plan,
      updatedAt: new Date().toISOString(),
      sanitizedFailure: null,
    };

    return this.config.repository.save(this.transitionState(record, 'APPROVAL_PENDING'));
  }

  public async approveRun(runId: string, runCode: string, approvedBy: string, approvalMessage: string): Promise<DemoRunRecord> {
    let record = this.config.repository.get(runId);
    if (!record) {
      throw new Error(`Unknown run: ${runId}`);
    }

    if (record.currentState !== 'APPROVAL_PENDING') {
      return this.rejectWithFailure(record, 'APPROVAL_DENIED', 'Approval can only be granted while the run is pending.');
    }

    if (record.runCode !== runCode) {
      return this.rejectWithFailure(record, 'APPROVAL_DENIED', 'Exact run code is required.');
    }

    if (approvedBy !== this.config.approverUserId) {
      return this.rejectWithFailure(record, 'APPROVAL_DENIED', 'Wrong approver.');
    }

    if (approvalMessage !== `APPROVE ${runCode}`) {
      return this.rejectWithFailure(record, 'APPROVAL_DENIED', 'Approval grammar must be EXACT.');
    }

    if (!record.plan) {
      return this.rejectWithFailure(record, 'PLAN_EXPIRED', 'Missing plan.');
    }

    if (new Date(record.plan.expiresAt).getTime() <= Date.now()) {
      return this.rejectWithFailure(record, 'PLAN_EXPIRED', 'Plan expired.');
    }

    const hashPayload = { ...record.plan };
    const payload = { ...hashPayload };
    delete (payload as { hash?: string }).hash;
    const expectedHash = createCanonicalRecoveryPlanHash(payload as never);
    if (record.plan.hash !== expectedHash) {
      return this.rejectWithFailure(record, 'MANUAL_REVIEW', 'Plan hash changed and must be re-inspected.');
    }

    record = {
      ...record,
      approvedAt: new Date().toISOString(),
      approvedBy,
      updatedAt: new Date().toISOString(),
      sanitizedFailure: null,
    };

    return this.config.repository.save(this.transitionState(record, 'APPROVED'));
  }

  public async executeRecovery(runId: string): Promise<DemoRunRecord> {
    let record = this.config.repository.get(runId);
    if (!record) {
      throw new Error(`Unknown run: ${runId}`);
    }

    if (record.currentState === 'VERIFIED') {
      const failure = SanitizedFailureSchema.parse({
        code: 'PRECONDITION_FAILED',
        message: 'RECOVERY_ALREADY_COMPLETED',
        provider: undefined,
      });

      return this.config.repository.save({
        ...record,
        sanitizedFailure: failure,
        updatedAt: new Date().toISOString(),
      });
    }

    if (record.currentState === 'VERIFICATION_FAILED' || record.currentState === 'MANUAL_REVIEW' || record.currentState === 'PLAN_EXPIRED' || record.currentState === 'APPROVAL_DENIED' || record.currentState === 'INSPECTION_FAILED' || record.currentState === 'NO_MISMATCH' || record.currentState === 'RECOVERY_PARTIAL') {
      return this.rejectWithFailure(record, 'MANUAL_REVIEW', 'Recovery is not allowed from a terminal state.');
    }

    if (record.currentState !== 'APPROVED') {
      return this.rejectWithFailure(record, 'MANUAL_REVIEW', 'Recovery cannot execute before approval.');
    }

    if (!record.plan) {
      return this.rejectWithFailure(record, 'MANUAL_REVIEW', 'Recovery plan missing.');
    }

    if (record.approvedBy !== this.config.approverUserId) {
      return this.rejectWithFailure(record, 'APPROVAL_DENIED', 'Approval actor mismatch.');
    }

    if (record.runCode == null) {
      return this.rejectWithFailure(record, 'MANUAL_REVIEW', 'Run code is required.');
    }

    if (new Date(record.plan.expiresAt).getTime() <= Date.now()) {
      return this.rejectWithFailure(record, 'PLAN_EXPIRED', 'Approved plan expired.');
    }

    const hashPayload = { ...record.plan };
    const payload = { ...hashPayload };
    delete (payload as { hash?: string }).hash;
    const expectedHash = createCanonicalRecoveryPlanHash(payload as never);
    if (record.plan.hash !== expectedHash) {
      return this.rejectWithFailure(record, 'MANUAL_REVIEW', 'Plan hash changed after approval.');
    }

    const before = this.config.repository.get(runId);
    const executed = new Set(before?.executedActionIds ?? []);

    if (record.plan.actions.some((action) => executed.has(action.actionId))) {
      return this.rejectWithFailure(record, 'MANUAL_REVIEW', 'Duplicate action execution prevented.');
    }

    try {
      const actionResults = [] as Array<{ actionId: string; type: string; status: string }>;
      for (const action of record.plan.actions) {
        if (executed.has(action.actionId)) {
          return this.rejectWithFailure(record, 'RECOVERY_PARTIAL', 'Duplicate action execution prevented.');
        }

        const idempotencyKey = createIdempotencyKey(record.runId, record.plan.hash, action.actionId, action.type);
        if (action.type === 'RESTORE_STRIPE_GRANDFATHERED_PRICE') {
          await this.config.providers.stripe.executeAllowlistedRecovery({
            runId: record.runId,
            actionId: action.actionId,
            planHash: record.plan.hash,
            idempotencyKey,
            approvedAt: record.approvedAt ?? new Date().toISOString(),
            customerAlias: 'northstar',
            accountMode: ORCHESTRATOR_ACCOUNT_MODE,
          });
        } else if (action.type === 'RESTORE_NOTION_PRICING_POLICY') {
          await this.config.providers.notion.executeAllowlistedRecovery({
            runId: record.runId,
            actionId: action.actionId,
            planHash: record.plan.hash,
            idempotencyKey,
            approvedAt: record.approvedAt ?? new Date().toISOString(),
            accountMode: ORCHESTRATOR_ACCOUNT_MODE,
          });
        } else if (action.type === 'POST_SLACK_RECOVERY_RECEIPT') {
          await this.config.providers.slack.postAllowlistedRecoveryReceipt({
            runId: record.runId,
            runCode: record.runCode ?? 'UNKNOWN',
            approvedAt: record.approvedAt ?? new Date().toISOString(),
            actionType: action.type,
            channelId: 'C123',
          });
        }

        executed.add(action.actionId);
        actionResults.push({ actionId: action.actionId, type: action.type, status: 'SUCCEEDED' });
      }

      record = this.transitionState(
        {
          ...record,
          executedActionIds: Array.from(executed),
          updatedAt: new Date().toISOString(),
        },
        'RECOVERING',
      );
      record = this.transitionState(record, 'VERIFYING');

      const refreshedStripe = await this.config.providers.stripe.verifyReread({
        provider: 'Stripe',
        customerAlias: 'northstar',
        accountMode: ORCHESTRATOR_ACCOUNT_MODE,
      });
      const refreshedNotion = await this.config.providers.notion.verifyReread({
        provider: 'Notion',
        accountMode: ORCHESTRATOR_ACCOUNT_MODE,
        pageId: 'page_123',
      });
      const refreshedSlack = await this.config.providers.slack.verifyReread({
        provider: 'Slack',
        accountMode: ORCHESTRATOR_ACCOUNT_MODE,
        channelId: 'C123',
      });

      const refreshedNormalized = {
        version: 'v1',
        stripe: {
          provider: 'Stripe',
          customerAlias: refreshedStripe.customerAlias,
          accountMode: refreshedStripe.accountMode,
          status: refreshedStripe.status,
          unitAmountCents: refreshedStripe.unitAmountCents,
          quantity: refreshedStripe.quantity,
          invoiceFingerprint: refreshedStripe.invoiceFingerprint,
          readAt: refreshedStripe.readAt,
        },
        notion: {
          provider: 'Notion',
          accountMode: refreshedNotion.accountMode,
          scope: refreshedNotion.scope,
          existingPriceCents: refreshedNotion.existingPriceCents,
          newCustomerPriceCents: refreshedNotion.newCustomerPriceCents,
          pageId: refreshedNotion.pageId,
          readAt: refreshedNotion.readAt,
        },
        slack: {
          provider: 'Slack',
          accountMode: refreshedSlack.accountMode,
          channelId: refreshedSlack.channelId,
          originalInstructionAvailable: refreshedSlack.originalInstructionAvailable,
          currentRunCode: refreshedSlack.currentRunCode,
          recoveryReceiptExists: refreshedSlack.recoveryReceiptExists,
          readAt: refreshedSlack.readAt,
        },
        readAt: new Date().toISOString(),
      } as const;

      const failureSet = verifyRecoveredState(refreshedNormalized, record.runCode || this.config.defaultRunCode);
      record = {
        ...record,
        normalizedSnapshots: {
          stripe: refreshedNormalized.stripe,
          notion: refreshedNormalized.notion,
          slack: refreshedNormalized.slack,
        },
        verification: failureSet,
        updatedAt: new Date().toISOString(),
      };

      if (failureSet.passes) {
        return this.config.repository.save(this.transitionState(record, 'VERIFIED'));
      }

      return this.config.repository.save(this.transitionState(record, 'VERIFICATION_FAILED'));
    } catch (error) {
      const failure = this.toSanitizedFailure(error, 'RECOVERY_PARTIAL');
      const terminalState = this.safeFailureState(record.currentState, 'RECOVERY_PARTIAL');
      const failed = this.transitionState(
        {
          ...record,
          sanitizedFailure: failure,
          updatedAt: new Date().toISOString(),
        },
        terminalState,
      );
      return this.config.repository.save(failed);
    }
  }

  public transitionState(record: DemoRunRecord, nextState: RunState): DemoRunRecord {
    assertValidRunTransition(record.currentState, nextState);
    const updated = {
      ...record,
      currentState: nextState,
      updatedAt: new Date().toISOString(),
    };
    return DemoRunRecordSchema.parse(updated);
  }

  private rejectWithFailure(record: DemoRunRecord, state: 'APPROVAL_DENIED' | 'PLAN_EXPIRED' | 'MANUAL_REVIEW' | 'RECOVERY_PARTIAL', message: string): DemoRunRecord {
    const failure = this.toSanitizedFailure(new Error(message), state);
    const terminalState = this.safeFailureState(record.currentState, state);

    if (record.currentState === 'VERIFICATION_FAILED' || record.currentState === 'VERIFIED' || record.currentState === 'INSPECTION_FAILED' || record.currentState === 'APPROVAL_DENIED' || record.currentState === 'PLAN_EXPIRED' || record.currentState === 'MANUAL_REVIEW' || record.currentState === 'NO_MISMATCH' || record.currentState === 'RECOVERY_PARTIAL') {
      const failed = this.transitionState(
        {
          ...record,
          sanitizedFailure: failure,
          updatedAt: new Date().toISOString(),
        },
        terminalState,
      );
      return this.config.repository.save(failed);
    }

    const failed = this.transitionState(
      {
        ...record,
        sanitizedFailure: failure,
        updatedAt: new Date().toISOString(),
      },
      terminalState,
    );
    return this.config.repository.save(failed);
  }

  private safeFailureState(currentState: DemoRunRecord['currentState'], fallback: 'INSPECTION_FAILED' | 'APPROVAL_DENIED' | 'PLAN_EXPIRED' | 'MANUAL_REVIEW' | 'RECOVERY_PARTIAL' | 'VERIFICATION_FAILED'): DemoRunRecord['currentState'] {
    const validStates: Record<DemoRunRecord['currentState'], readonly DemoRunRecord['currentState'][]> = {
      CREATED: ['MANUAL_REVIEW'],
      INSPECTING: ['MANUAL_REVIEW', 'INSPECTION_FAILED'],
      MISMATCH_FOUND: ['MANUAL_REVIEW'],
      APPROVAL_PENDING: ['APPROVAL_DENIED', 'PLAN_EXPIRED', 'MANUAL_REVIEW'],
      APPROVED: ['MANUAL_REVIEW'],
      RECOVERING: ['RECOVERY_PARTIAL', 'MANUAL_REVIEW'],
      VERIFYING: ['VERIFICATION_FAILED', 'MANUAL_REVIEW'],
      VERIFIED: ['MANUAL_REVIEW'],
      NO_MISMATCH: ['MANUAL_REVIEW'],
      MANUAL_REVIEW: ['MANUAL_REVIEW'],
      INSPECTION_FAILED: ['INSPECTION_FAILED'],
      APPROVAL_DENIED: ['APPROVAL_DENIED'],
      PLAN_EXPIRED: ['PLAN_EXPIRED'],
      RECOVERY_PARTIAL: ['RECOVERY_PARTIAL'],
      VERIFICATION_FAILED: ['MANUAL_REVIEW', 'VERIFICATION_FAILED'],
    };

    const candidates = validStates[currentState] ?? [fallback];
    const fallbackState = fallback as DemoRunRecord['currentState'];
    if (candidates.includes(fallbackState) && (fallback === 'MANUAL_REVIEW' || fallback === 'INSPECTION_FAILED' || fallback === 'APPROVAL_DENIED' || fallback === 'PLAN_EXPIRED' || fallback === 'VERIFICATION_FAILED')) {
      return fallback;
    }
    return candidates[0] ?? 'MANUAL_REVIEW';
  }

  private toSanitizedFailure(error: unknown, fallbackState: 'INSPECTION_FAILED' | 'APPROVAL_DENIED' | 'PLAN_EXPIRED' | 'MANUAL_REVIEW' | 'RECOVERY_PARTIAL' | 'VERIFICATION_FAILED'): SanitizedFailure {
    const message = error instanceof Error ? error.message : 'Unknown failure';
    const code = message.includes('approval') || message.includes('approver') || message.includes('APPROVE')
      ? 'PRECONDITION_FAILED'
      : message.includes('expired') || message.includes('hash')
        ? 'PRECONDITION_FAILED'
        : message.includes('provider') || message.includes('timeout')
          ? 'TIMEOUT'
          : 'UNKNOWN';

    return SanitizedFailureSchema.parse({
      code,
      message: message.slice(0, 200),
      provider: fallbackState === 'INSPECTION_FAILED' ? 'Stripe' : undefined,
    });
  }
}
