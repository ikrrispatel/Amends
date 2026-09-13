/** Deterministic local fixture; it is not a live Stripe provider. */
import type { StripeSubscriptionSnapshot, StripeTestClient } from "./stripe.js";

export type SyntheticStripeRecord = {
  readonly customerId: string;
  readonly subscriptionId: string;
  readonly priceId: string;
  readonly unitAmount: number;
  readonly quantity: number;
};

export type SyntheticStripeClient = StripeTestClient & {
  readonly getUpdateCount: () => number;
};

export function createSyntheticStripeClient(
  records: readonly SyntheticStripeRecord[] = [
    { customerId: "cus_northstar", subscriptionId: "sub_northstar", priceId: "price_new", unitAmount: 12900, quantity: 87 },
  ],
): SyntheticStripeClient {
  const snapshots = new Map<string, StripeSubscriptionSnapshot>(records.map((record) => [record.subscriptionId, {
    subscriptionId: record.subscriptionId,
    customerId: record.customerId,
    status: "active",
    priceId: record.priceId,
    unitAmount: record.unitAmount,
    quantity: record.quantity,
    latestInvoiceId: null,
  }]));
  let updateCount = 0;

  return {
    retrieveSubscription: async (subscriptionId) => {
      const snapshot = snapshots.get(subscriptionId);
      if (!snapshot) throw new Error("Synthetic subscription not found.");
      return snapshot;
    },
    updateSubscription: async (request) => {
      const current = snapshots.get(request.subscriptionId);
      if (!current) throw new Error("Synthetic subscription not found.");
      updateCount += 1;
      const next = { ...current, priceId: request.priceId, unitAmount: 9900, quantity: request.quantity };
      snapshots.set(request.subscriptionId, next);
      return next;
    },
    getUpdateCount: () => updateCount,
  };
}
