import assert from "node:assert/strict";
import test from "node:test";
import { StripeAdapter, StripeAdapterError, type StripeCustomerRecord, type StripeSubscriptionSnapshot, type StripeTestClient } from "./stripe.js";

const record: StripeCustomerRecord = {
  alias: "northstar",
  customerId: "cus_northstar",
  subscriptionId: "sub_northstar",
  subscriptionItemId: "si_northstar",
  grandfatheredPriceId: "price_old",
  newPriceId: "price_new",
  grandfatheredUnitAmount: 9900,
  quantity: 87,
};

const context = {
  runId: "run-001",
  actionId: "action-001",
  planHash: "a".repeat(64),
  idempotencyKey: "recover-northstar-001",
  approvedAt: "2026-09-13T20:00:00.000Z",
  customerAlias: "northstar" as const,
  accountMode: "TEST" as const,
};

function fixture(): { adapter: StripeAdapter; client: StripeTestClient; calls: Array<Record<string, unknown>>; set: (snapshot: StripeSubscriptionSnapshot) => void } {
  let snapshot: StripeSubscriptionSnapshot = {
    subscriptionItemId: record.subscriptionItemId,
    subscriptionId: record.subscriptionId,
    customerId: record.customerId,
    status: "active",
    priceId: record.newPriceId,
    unitAmount: 12900,
    quantity: 87,
    latestInvoiceId: null,
  };
  const calls: Array<Record<string, unknown>> = [];
  const client: StripeTestClient = {
    retrieveSubscription: async () => snapshot,
    updateSubscription: async (request) => {
      calls.push(request);
      snapshot = { ...snapshot, priceId: request.priceId, unitAmount: 9900, quantity: request.quantity };
      return snapshot;
    },
  };
  return { adapter: new StripeAdapter({ secretKey: "sk_test_fixture", customers: { northstar: record } }, client), client, calls, set: (next) => { snapshot = next; } };
}

test("rejects live keys and unknown configured IDs", () => {
  assert.throws(() => new StripeAdapter({ secretKey: "sk_live_fixture", customers: { northstar: record } }, fixture().client), (error: unknown) => error instanceof StripeAdapterError && error.code === "LIVE_KEY_REJECTED");
  assert.throws(() => new StripeAdapter({ secretKey: "sk_test_fixture", customers: { northstar: { ...record, subscriptionItemId: "bad" } } }, fixture().client), (error: unknown) => error instanceof StripeAdapterError && error.code === "INVALID_ID");
});

test("inspection returns the frozen provider state shape", async () => {
  const { adapter } = fixture();
  const state = await adapter.inspect({ provider: "Stripe", customerAlias: "northstar", accountMode: "TEST" });
  assert.deepEqual({ ...state, readAt: "redacted" }, {
    provider: "Stripe", customerAlias: "northstar", accountMode: "TEST", subscriptionItemId: "si_northstar",
    grandfatheredPriceId: "price_old", currentPriceId: "price_new", status: "ACTIVE", unitAmountCents: 12900,
    quantity: 87, invoiceFingerprint: null, readAt: "redacted",
  });
});

test("recovery preserves quantity, disables proration, forwards idempotency, and sanitizes result", async () => {
  const { adapter, calls } = fixture();
  await adapter.inspect({ provider: "Stripe", customerAlias: "northstar", accountMode: "TEST" });
  const result = await adapter.executeAllowlistedRecovery(context);
  assert.equal(result.status, "SUCCEEDED");
  assert.equal(result.verified, true);
  assert.deepEqual(Object.keys(result).sort(), ["actionType", "provider", "readAt", "resultId", "status", "verified"].sort());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].quantity, 87);
  assert.equal(calls[0].prorationBehavior, "none");
  assert.equal(calls[0].idempotencyKey, context.idempotencyKey);
});

test("changed precondition is rejected", async () => {
  const { adapter, set } = fixture();
  await adapter.inspect({ provider: "Stripe", customerAlias: "northstar", accountMode: "TEST" });
  set({ subscriptionItemId: record.subscriptionItemId, subscriptionId: record.subscriptionId, customerId: record.customerId, status: "active", priceId: "price_changed", unitAmount: 12900, quantity: 87, latestInvoiceId: null });
  await assert.rejects(() => adapter.executeAllowlistedRecovery(context), (error: unknown) => error instanceof StripeAdapterError && error.code === "PRECONDITION_FAILED");
});

test("repeated recovery is skipped without a duplicate mutation", async () => {
  const { adapter, calls } = fixture();
  await adapter.inspect({ provider: "Stripe", customerAlias: "northstar", accountMode: "TEST" });
  await adapter.executeAllowlistedRecovery(context);
  await adapter.inspect({ provider: "Stripe", customerAlias: "northstar", accountMode: "TEST" });
  const second = await adapter.executeAllowlistedRecovery(context);
  assert.equal(second.status, "SKIPPED");
  assert.equal(calls.length, 1);
});
