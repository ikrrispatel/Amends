import { createChronoBoundary, type ChronoMutation } from "../chrono/adapter.js";
import type { ActionLedger } from "../infrastructure/action-ledger.js";
import type { StripeAdapter, StripeSubscriptionSnapshot } from "../integrations/stripe.js";

export type StripeRecoveryRequest = {
  readonly actionId: string;
  readonly runId: string;
  readonly customerAlias: string;
  readonly expected: StripeSubscriptionSnapshot;
  readonly idempotencyKey: string;
  readonly now: string;
};

export type StripeRecoveryResult = {
  readonly status: "COMMITTED" | "ALREADY_COMMITTED" | "REPLAY" | "IN_PROGRESS" | "FAILED";
  readonly snapshot?: StripeSubscriptionSnapshot;
};

function resultJson(result: StripeRecoveryResult): string {
  return JSON.stringify(result);
}

/** Execute one allowlisted Stripe recovery action through the Chrono boundary. */
export async function executeStripeRecovery(
  request: StripeRecoveryRequest,
  adapter: StripeAdapter,
  ledger: ActionLedger,
): Promise<StripeRecoveryResult> {
  const claim = ledger.claim({
    id: request.actionId,
    runId: request.runId,
    actionType: "RESTORE_STRIPE_GRANDFATHERED_PRICE",
    idempotencyKey: request.idempotencyKey,
    preconditionsJson: JSON.stringify(request.expected),
    createdAt: request.now,
  });

  if (claim.kind === "CONFLICT") throw new Error("Idempotency key belongs to another action.");
  if (claim.kind === "REPLAY") {
    if (claim.record.status === "CLAIMED") return { status: "IN_PROGRESS" };
    if (!claim.record.resultJson) return { status: "REPLAY" };
    const previous = JSON.parse(claim.record.resultJson) as StripeRecoveryResult;
    return { ...previous, status: "REPLAY" };
  }

  const chrono = createChronoBoundary(async (mutation: ChronoMutation) => {
    if (mutation.kind !== "RESTORE_STRIPE_GRANDFATHERED_PRICE") {
      return { ok: false, detailCode: "REJECTED" };
    }
    const result = await adapter.restoreGrandfatheredPrice(
      request.customerAlias,
      request.expected,
      mutation.idempotencyKey,
    );
    return { ok: true, detailCode: result.status };
  });

  const record = await adapter.readCustomer(request.customerAlias);
  const mutation: ChronoMutation = {
    kind: "RESTORE_STRIPE_GRANDFATHERED_PRICE",
    customerId: record.customerId,
    subscriptionId: record.subscriptionId,
    priceId: record.priceId,
    quantity: 87,
    unitAmount: 9900,
    idempotencyKey: request.idempotencyKey,
  };

  try {
    const execution = await chrono(mutation);
    if (!execution.ok) {
      const failed: StripeRecoveryResult = { status: "FAILED" };
      ledger.finish(request.idempotencyKey, mutation.kind, "FAILED", resultJson(failed), request.now);
      return failed;
    }
    const snapshot = await adapter.readCustomer(request.customerAlias);
    const completed: StripeRecoveryResult = {
      status: execution.detailCode === "ALREADY_COMMITTED" ? "ALREADY_COMMITTED" : "COMMITTED",
      snapshot,
    };
    ledger.finish(request.idempotencyKey, mutation.kind, "COMPLETED", resultJson(completed), request.now);
    return completed;
  } catch {
    const failed: StripeRecoveryResult = { status: "FAILED" };
    ledger.finish(request.idempotencyKey, mutation.kind, "FAILED", resultJson(failed), request.now);
    return failed;
  }
}
