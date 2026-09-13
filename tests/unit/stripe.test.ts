import { describe, expect, it, vi } from "vitest";
import {
  StripeAdapter,
  StripeAdapterError,
  type StripeSubscriptionSnapshot,
  type StripeTestClient,
} from "../../src/integrations/stripe.js";

const config = {
  secretKey: "sk_test_demo123",
  northstarCustomerId: "cus_northstar",
  northstarSubscriptionId: "sub_northstar",
  grandfatheredPriceId: "price_grandfathered",
} as const;

const wrongSnapshot: StripeSubscriptionSnapshot = {
  subscriptionId: "sub_northstar",
  customerId: "cus_northstar",
  status: "active",
  priceId: "price_new",
  unitAmount: 12900,
  quantity: 87,
  latestInvoiceId: null,
};

const restoredSnapshot: StripeSubscriptionSnapshot = {
  ...wrongSnapshot,
  priceId: "price_grandfathered",
  unitAmount: 9900,
};

function client(overrides: Partial<StripeTestClient> = {}): StripeTestClient {
  return {
    retrieveSubscription: vi.fn(async () => wrongSnapshot),
    updateSubscription: vi.fn(async () => restoredSnapshot),
    ...overrides,
  };
}

describe("StripeAdapter", () => {
  it("rejects live-mode keys before a client call", () => {
    expect(
      () =>
        new StripeAdapter(
          { ...config, secretKey: "sk_live_do_not_use" },
          client(),
        ),
    ).toThrowError(new StripeAdapterError("LIVE_KEY_REJECTED", "Stripe mutations require a test-mode secret key."));
  });

  it("restores Northstar with quantity 87 and no proration", async () => {
    const updateSubscription = vi.fn(async () => restoredSnapshot);
    const adapter = new StripeAdapter(config, client({ updateSubscription }));

    const result = await adapter.restoreGrandfatheredPrice(
      wrongSnapshot,
      "run_demo_stripe_restore_001",
    );

    expect(result.status).toBe("COMMITTED");
    expect(updateSubscription).toHaveBeenCalledWith({
      subscriptionId: "sub_northstar",
      priceId: "price_grandfathered",
      quantity: 87,
      prorationBehavior: "none",
      idempotencyKey: "run_demo_stripe_restore_001",
    });
  });

  it("fails closed when Stripe state changes after inspection", async () => {
    const adapter = new StripeAdapter(
      config,
      client({
        retrieveSubscription: vi.fn(async () => ({ ...wrongSnapshot, quantity: 86 })),
      }),
    );

    await expect(
      adapter.restoreGrandfatheredPrice(wrongSnapshot, "run_demo_stripe_restore_002"),
    ).rejects.toMatchObject({ code: "PRECONDITION_FAILED" });
  });

  it("returns ALREADY_COMMITTED without a second mutation", async () => {
    const updateSubscription = vi.fn(async () => restoredSnapshot);
    const adapter = new StripeAdapter(
      config,
      client({
        retrieveSubscription: vi.fn(async () => restoredSnapshot),
        updateSubscription,
      }),
    );

    const result = await adapter.restoreGrandfatheredPrice(
      restoredSnapshot,
      "run_demo_stripe_restore_003",
    );

    expect(result.status).toBe("ALREADY_COMMITTED");
    expect(updateSubscription).not.toHaveBeenCalled();
  });
});
