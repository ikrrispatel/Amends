/** Deterministic local fixture; it is not a live Stripe provider. */
import type { StripeCustomerRecord, StripeSubscriptionSnapshot, StripeTestClient } from "./stripe.js";

export type SyntheticStripeRecord = {
  readonly customerId: string;
  readonly subscriptionId: string;
  readonly subscriptionItemId: string;
  readonly priceId: string;
  readonly unitAmount: number;
  readonly quantity: number;
};

export type SyntheticStripeClient = StripeTestClient & {
  readonly getUpdateCount: () => number;
  readonly reset: () => void;
  readonly injectFault: () => void;
};

export function createSyntheticStripeClient(
  records: readonly SyntheticStripeRecord[] = [
    { customerId: "cus_northstar", subscriptionId: "sub_northstar", subscriptionItemId: "si_northstar", priceId: "price_new", unitAmount: 12900, quantity: 87 },
  ],
): SyntheticStripeClient {
  const baseline = new Map<string, StripeSubscriptionSnapshot>(records.map((record) => [record.subscriptionId, {
    subscriptionItemId: record.subscriptionItemId,
    subscriptionId: record.subscriptionId,
    customerId: record.customerId,
    status: "active",
    priceId: record.priceId,
    unitAmount: record.unitAmount,
    quantity: record.quantity,
    latestInvoiceId: null,
  }]));
  const snapshots = new Map(baseline);
  let updateCount = 0;

  return {
    retrieveSubscription: async (record: StripeCustomerRecord) => {
      const snapshot = snapshots.get(record.subscriptionId);
      if (!snapshot) throw new Error("Synthetic subscription not found.");
      return snapshot;
    },
    updateSubscription: async (request) => {
      const current = snapshots.get(request.record.subscriptionId);
      if (!current) throw new Error("Synthetic subscription not found.");
      updateCount += 1;
      const next = { ...current, priceId: request.priceId, unitAmount: 9900, quantity: request.quantity };
      snapshots.set(request.record.subscriptionId, next);
      return next;
    },
    getUpdateCount: () => updateCount,
    reset: () => {
      snapshots.clear();
      for (const [id, snapshot] of baseline) snapshots.set(id, snapshot);
      updateCount = 0;
    },
    injectFault: () => {
      for (const [id, snapshot] of snapshots) {
        snapshots.set(id, { ...snapshot, priceId: "price_new", unitAmount: 12900 });
      }
    },
  };
}
