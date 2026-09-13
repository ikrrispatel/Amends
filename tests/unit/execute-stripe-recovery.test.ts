import { describe, expect, it, vi } from "vitest";
import { InMemoryActionLedger } from "../../src/infrastructure/action-ledger.js";
import { createSyntheticStripeClient } from "../../src/integrations/stripe-demo.js";
import { StripeAdapter } from "../../src/integrations/stripe.js";
import { executeStripeRecovery } from "../../src/application/execute-stripe-recovery.js";

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

describe("executeStripeRecovery", () => {
  it("recovers through the Chrono boundary and records completion", async () => {
    const adapter = new StripeAdapter(config, createSyntheticStripeClient());
    const ledger = new InMemoryActionLedger();
    const expected = await adapter.readCustomer("northstar");
    const result = await executeStripeRecovery({
      actionId: "action_demo_100",
      runId: "run_demo_100",
      customerAlias: "northstar",
      expected,
      idempotencyKey: "run_demo_stripe_100",
      now: "2026-09-13T00:00:00Z",
    }, adapter, ledger);

    expect(result.status).toBe("COMMITTED");
    expect(result.snapshot?.unitAmount).toBe(9900);
  });

  it("does not execute a second mutation on replay", async () => {
    const synthetic = createSyntheticStripeClient();
    const adapter = new StripeAdapter(config, synthetic);
    const ledger = new InMemoryActionLedger();
    const expected = await adapter.readCustomer("northstar");
    const request = {
      actionId: "action_demo_101",
      runId: "run_demo_101",
      customerAlias: "northstar",
      expected,
      idempotencyKey: "run_demo_stripe_101",
      now: "2026-09-13T00:00:00Z",
    } as const;

    await executeStripeRecovery(request, adapter, ledger);
    const replay = await executeStripeRecovery(request, adapter, ledger);

    expect(replay.status).toBe("REPLAY");
    expect(synthetic.getUpdateCount()).toBe(1);
  });

  it("records a failed provider mutation without claiming recovery", async () => {
    const adapter = new StripeAdapter(config, createSyntheticStripeClient());
    const ledger = new InMemoryActionLedger();
    const expected = await adapter.readCustomer("northstar");
    vi.spyOn(adapter, "restoreGrandfatheredPrice").mockRejectedValue(new Error("provider timeout"));

    const result = await executeStripeRecovery({
      actionId: "action_demo_102",
      runId: "run_demo_102",
      customerAlias: "northstar",
      expected,
      idempotencyKey: "run_demo_stripe_102",
      now: "2026-09-13T00:00:00Z",
    }, adapter, ledger);

    expect(result.status).toBe("FAILED");
  });
});
