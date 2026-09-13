/**
 * Deterministic local Stripe fixture for development and automated tests.
 * This is not a Stripe API emulator and must never be described as a live
 * provider run. The live adapter can be injected later without changing the
 * Team B contract.
 */
import type {
  StripeSubscriptionSnapshot,
  StripeTestClient,
} from "./stripe.js";

export type SyntheticStripeClient = StripeTestClient & {
  readonly getUpdateCount: () => number;
};

export function createSyntheticStripeClient(
  mode: "wrong" | "expected" = "wrong",
): SyntheticStripeClient {
  let updateCount = 0;
  let snapshot: StripeSubscriptionSnapshot = {
    subscriptionId: "sub_northstar",
    customerId: "cus_northstar",
    status: "active",
    priceId: mode === "wrong" ? "price_new" : "price_grandfathered",
    unitAmount: mode === "wrong" ? 12900 : 9900,
    quantity: 87,
    latestInvoiceId: null,
  };

  return {
    retrieveSubscription: async () => snapshot,
    updateSubscription: async (request) => {
      updateCount += 1;
      snapshot = {
        ...snapshot,
        priceId: request.priceId,
        unitAmount: 9900,
        quantity: request.quantity,
      };
      return snapshot;
    },
    getUpdateCount: () => updateCount,
  };
}
