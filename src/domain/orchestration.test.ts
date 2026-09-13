import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  DEFAULT_OUTCOME_CONTRACT,
  buildRecoveryPlan,
  calculateExposureCents,
  compareContractToNormalizedState,
  createDefaultRecoveryActions,
  extractIntentContract,
  verifyRecoveredState,
} from './orchestration';

const wrongNormalizedState = {
  version: 'v1',
  stripe: {
    provider: 'Stripe',
    customerAlias: 'northstar',
    accountMode: 'TEST',
    status: 'ACTIVE',
    unitAmountCents: 12_900,
    quantity: 87,
    invoiceFingerprint: null,
    readAt: '2026-09-13T00:00:00.000Z',
  },
  notion: {
    provider: 'Notion',
    accountMode: 'TEST',
    scope: 'all_customers',
    existingPriceCents: 12_900,
    newCustomerPriceCents: 12_900,
    pageId: 'page_123',
    readAt: '2026-09-13T00:00:00.000Z',
  },
  slack: {
    provider: 'Slack',
    accountMode: 'TEST',
    channelId: 'C123',
    originalInstructionAvailable: true,
    currentRunCode: null,
    recoveryReceiptExists: false,
    readAt: '2026-09-13T00:00:00.000Z',
  },
  readAt: '2026-09-13T00:00:00.000Z',
} as const;

const recoveredState = {
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
} as const;

describe('Orchestration and deterministic domain engine', () => {
  it('extracts the locked outcome contract and recognizes the canonical Slack instruction', () => {
    const contract = extractIntentContract(
      'Launch the Pro 2027 plan at $129 per seat for new customers only. Northstar and every existing enterprise customer stay grandfathered at $99 per seat. Update our pricing policy and confirm when complete.',
    );

    assert.deepEqual(contract, DEFAULT_OUTCOME_CONTRACT);
  });

  it('produces exactly two business mismatches and the locked exposure value', () => {
    const mismatches = compareContractToNormalizedState(DEFAULT_OUTCOME_CONTRACT, wrongNormalizedState);
    assert.equal(mismatches.length, 2);
    assert.deepEqual(mismatches.map((item) => item.provider), ['Stripe', 'Notion']);
    assert.equal(calculateExposureCents(DEFAULT_OUTCOME_CONTRACT, wrongNormalizedState), 261_000);
  });

  it('creates a deterministic recovery plan with the exact allowlisted variants', () => {
    const actions = createDefaultRecoveryActions('RUN-123');
    const plan = buildRecoveryPlan('run-123', 'RUN-123', '2026-09-13T00:00:00.000Z', '2026-09-14T00:00:00.000Z', actions);

    assert.equal(actions.length, 3);
    assert.equal(plan.actions.length, 3);
    assert.equal(plan.hash.length, 64);
    assert.equal(plan.preconditions.approvalCode, 'APPROVE RUN-123');
    assert.equal(plan.preconditions.actorAllowlist[0], 'slack-approver');
  });

  it('successfully verifies a restored business state with all five checks', () => {
    const result = verifyRecoveredState(recoveredState, 'RUN-123');
    assert.equal(result.passes, true);
    assert.equal(result.checks.length, 5);
    assert.deepEqual(result.checks.every((check) => check.passed), true);
  });
});
