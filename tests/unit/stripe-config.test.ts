import { describe, expect, it } from "vitest";
import { loadStripeConfig } from "../../src/infrastructure/stripe-config.js";

const customer = {
  alias: "northstar",
  customerId: "cus_northstar",
  subscriptionId: "sub_northstar",
  grandfatheredPriceId: "price_old",
  grandfatheredUnitAmount: 9900,
  quantity: 87,
};

describe("loadStripeConfig", () => {
  it("loads multiple configured customer records", () => {
    const config = loadStripeConfig({
      STRIPE_SECRET_KEY: "sk_test_demo123",
      STRIPE_CUSTOMERS_JSON: JSON.stringify([customer, { ...customer, alias: "acme", customerId: "cus_acme", subscriptionId: "sub_acme" }]),
    });
    expect(Object.keys(config.customers)).toEqual(["northstar", "acme"]);
  });

  it("rejects malformed configuration and unknown fields", () => {
    expect(() => loadStripeConfig({ STRIPE_SECRET_KEY: "sk_test_demo123", STRIPE_CUSTOMERS_JSON: "{}" })).toThrow();
    expect(() => loadStripeConfig({ STRIPE_SECRET_KEY: "sk_test_demo123", STRIPE_CUSTOMERS_JSON: JSON.stringify([{ ...customer, secret: "leak" }]) })).toThrow("Unknown Stripe customer field");
  });

  it("requires a server-side test key", () => {
    expect(() => loadStripeConfig({ STRIPE_CUSTOMERS_JSON: JSON.stringify([customer]) })).toThrow("STRIPE_SECRET_KEY");
    expect(() => loadStripeConfig({ STRIPE_SECRET_KEY: "sk_live_bad", STRIPE_CUSTOMERS_JSON: JSON.stringify([customer]) })).toThrow("test-mode");
  });
});
