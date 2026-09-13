import { InMemoryActionLedger } from "../infrastructure/action-ledger.js";
import { executeStripeRecovery } from "./execute-stripe-recovery.js";
import { createSyntheticStripeClient, type SyntheticStripeClient } from "../integrations/stripe-demo.js";
import { StripeAdapter, type StripeCustomerRecord, type StripeSubscriptionSnapshot } from "../integrations/stripe.js";

export type DemoRunState = "READY" | "FAULTED" | "INSPECTED" | "RECOVERED" | "VERIFIED";

export type DemoStripeRun = {
  readonly reset: () => void;
  readonly injectFault: () => void;
  readonly inspect: () => Promise<StripeSubscriptionSnapshot>;
  readonly recover: () => Promise<"COMMITTED" | "ALREADY_COMMITTED" | "REPLAY" | "IN_PROGRESS" | "FAILED">;
  readonly verify: () => Promise<boolean>;
  readonly state: () => DemoRunState;
};

const customer: StripeCustomerRecord = {
  alias: "northstar",
  customerId: "cus_northstar",
  subscriptionId: "sub_northstar",
  grandfatheredPriceId: "price_grandfathered",
  grandfatheredUnitAmount: 9900,
  quantity: 87,
};

export function createDemoStripeRun(): DemoStripeRun {
  const synthetic: SyntheticStripeClient = createSyntheticStripeClient();
  const adapter = new StripeAdapter({ secretKey: "sk_test_demo123", customers: { northstar: customer } }, synthetic);
  const ledger = new InMemoryActionLedger();
  let currentState: DemoRunState = "READY";
  let inspected: StripeSubscriptionSnapshot | undefined;
  let runNumber = 0;

  return {
    reset: () => {
      synthetic.reset();
      inspected = undefined;
      currentState = "READY";
      runNumber += 1;
    },
    injectFault: () => {
      if (currentState !== "READY") throw new Error("Demo must be reset before fault injection.");
      synthetic.injectFault();
      currentState = "FAULTED";
    },
    inspect: async () => {
      if (currentState !== "FAULTED") throw new Error("Demo must be faulted before inspection.");
      inspected = await adapter.readCustomer("northstar");
      currentState = "INSPECTED";
      return inspected;
    },
    recover: async () => {
      if (currentState !== "INSPECTED" || !inspected) throw new Error("Demo must be inspected before recovery.");
      const result = await executeStripeRecovery({
        actionId: `action_demo_${runNumber.toString().padStart(3, "0")}`,
        runId: `run_demo_${runNumber.toString().padStart(3, "0")}`,
        customerAlias: "northstar",
        expected: inspected,
        idempotencyKey: `run_demo_stripe_${runNumber.toString().padStart(3, "0")}`,
        now: new Date().toISOString(),
      }, adapter, ledger);
      if (result.status === "COMMITTED" || result.status === "ALREADY_COMMITTED" || result.status === "REPLAY") currentState = "RECOVERED";
      return result.status;
    },
    verify: async () => {
      if (currentState !== "RECOVERED") return false;
      const snapshot = await adapter.readCustomer("northstar");
      const valid = snapshot.status === "active" && snapshot.unitAmount === 9900 && snapshot.quantity === 87 && snapshot.latestInvoiceId === null;
      if (valid) currentState = "VERIFIED";
      return valid;
    },
    state: () => currentState,
  };
}
