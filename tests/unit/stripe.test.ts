import { describe, expect, it, vi } from "vitest";
import {
  StripeAdapter,
  StripeAdapterError,
  verifyNoProration,
  type StripeSubscriptionSnapshot,
  type StripeTestClient,
} from "../../src/integrations/stripe.js";
import { createSyntheticStripeClient } from "../../src/integrations/stripe-demo.js";

const config = {
  secretKey: "sk_test_demo123",
  customers: {
    northstar: {
      alias: "northstar",
      customerId: "cus_northstar",
      subscriptionId: "sub_northstar",
      grandfatheredPriceId: "price_grandfathered",
      grandfatheredUnitAmount: 9900,
      quantity: 87,
    },
  },
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
        new StripeAdapter({ ...config, secretKey: "sk_live_do_not_use" }, client()),
    ).toThrowError(new StripeAdapterError("LIVE_KEY_REJECTED", "Stripe mutations require a test-mode secret key."));
  });

  it("restores Northstar with quantity 87 and no proration", async () => {
    const updateSubscription = vi.fn(async () => restoredSnapshot);
    const adapter = new StripeAdapter(config, client({ updateSubscription }));

    const result = await adapter.restoreGrandfatheredPrice(
      "northstar",
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
      adapter.restoreGrandfatheredPrice("northstar", wrongSnapshot, "run_demo_stripe_restore_002"),
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
      "northstar",
      restoredSnapshot,
      "run_demo_stripe_restore_003",
    );

    expect(result.status).toBe("ALREADY_COMMITTED");
    expect(updateSubscription).not.toHaveBeenCalled();
  });

  it("supports a deterministic local wrong-state fixture", async () => {
    const synthetic = createSyntheticStripeClient();
    const adapter = new StripeAdapter(config, synthetic);
    const wrong = await adapter.readCustomer("northstar");

    await adapter.restoreGrandfatheredPrice("northstar", wrong, "run_demo_stripe_restore_004");
    const restored = await adapter.readCustomer("northstar");

    expect(wrong.unitAmount).toBe(12900);
    expect(restored.unitAmount).toBe(9900);
    expect(restored.quantity).toBe(87);
    expect(synthetic.getUpdateCount()).toBe(1);
  });

  it("supports more than one configured customer", async () => {
    const second = {
      alias: "acme",
      customerId: "cus_acme",
      subscriptionId: "sub_acme",
      grandfatheredPriceId: "price_acme_old",
      grandfatheredUnitAmount: 9900,
      quantity: 12,
    } as const;
    const adapter = new StripeAdapter(
      { ...config, customers: { ...config.customers, acme: second } },
      client({
        retrieveSubscription: vi.fn(async (id) => id === "sub_acme" ? { ...wrongSnapshot, customerId: "cus_acme", subscriptionId: "sub_acme", quantity: 12 } : wrongSnapshot),
      }),
    );

    const snapshot = await adapter.readCustomer("acme");
    expect(snapshot.customerId).toBe("cus_acme");
    expect(snapshot.quantity).toBe(12);
  });

  it("resets and injects the deterministic successful-but-wrong state", async () => {
    const synthetic = createSyntheticStripeClient([
      { customerId: "cus_northstar", subscriptionId: "sub_northstar", priceId: "price_old", unitAmount: 9900, quantity: 87 },
      { customerId: "cus_acme", subscriptionId: "sub_acme", priceId: "price_old", unitAmount: 9900, quantity: 12 },
    ]);
    synthetic.injectFault();
    expect((await synthetic.retrieveSubscription("sub_northstar")).unitAmount).toBe(12900);
    expect((await synthetic.retrieveSubscription("sub_acme")).unitAmount).toBe(12900);
    synthetic.reset();
    expect((await synthetic.retrieveSubscription("sub_northstar")).unitAmount).toBe(9900);
    expect((await synthetic.retrieveSubscription("sub_acme")).unitAmount).toBe(9900);
  });

  it("rejects an unknown customer alias before reading Stripe", async () => {
    const retrieveSubscription = vi.fn(async () => wrongSnapshot);
    const adapter = new StripeAdapter(config, client({ retrieveSubscription }));
    await expect(adapter.readCustomer("not-allowlisted")).rejects.toMatchObject({ code: "INVALID_ALIAS" });
    expect(retrieveSubscription).not.toHaveBeenCalled();
  });

  it("rejects malformed idempotency keys before mutation", async () => {
    const updateSubscription = vi.fn(async () => restoredSnapshot);
    const adapter = new StripeAdapter(config, client({ updateSubscription }));
    await expect(adapter.restoreGrandfatheredPrice("northstar", wrongSnapshot, "bad")).rejects.toMatchObject({ code: "INVALID_IDEMPOTENCY_KEY" });
    expect(updateSubscription).not.toHaveBeenCalled();
  });

  it("fails closed when recovery creates a new invoice fingerprint", async () => {
    const adapter = new StripeAdapter(
      config,
      client({
        updateSubscription: vi.fn(async () => ({ ...restoredSnapshot, latestInvoiceId: "in_new" })),
      }),
    );
    await expect(
      adapter.restoreGrandfatheredPrice("northstar", wrongSnapshot, "run_demo_stripe_restore_005"),
    ).rejects.toMatchObject({ code: "PRORATION_DETECTED" });
  });

  it("accepts an unchanged invoice fingerprint", () => {
    expect(() => verifyNoProration(wrongSnapshot, restoredSnapshot)).not.toThrow();
  });
});
