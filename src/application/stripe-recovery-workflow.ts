import { InMemoryActionLedger } from "../infrastructure/action-ledger.js";
import { AuditLedger, type AuditEvent } from "../infrastructure/audit.js";
import { transitionRun, type RunState } from "../domain/transitions.js";
import { createSyntheticStripeClient } from "../integrations/stripe-demo.js";
import { StripeAdapter, type StripeCustomerRecord, type StripeSubscriptionSnapshot } from "../integrations/stripe.js";
import { executeStripeRecovery } from "./execute-stripe-recovery.js";

export type StripeWorkflow = {
  readonly startInspection: () => Promise<StripeSubscriptionSnapshot>;
  readonly requestApproval: () => void;
  readonly approve: () => void;
  readonly recover: () => Promise<string>;
  readonly verify: () => Promise<boolean>;
  readonly state: () => RunState;
  readonly audit: () => readonly AuditEvent[];
};

export function createSyntheticStripeWorkflow(): StripeWorkflow {
  const customer: StripeCustomerRecord = {
    alias: "northstar",
    customerId: "cus_northstar",
    subscriptionId: "sub_northstar",
    grandfatheredPriceId: "price_grandfathered",
    grandfatheredUnitAmount: 9900,
    quantity: 87,
  };
  const client = createSyntheticStripeClient();
  const adapter = new StripeAdapter({ secretKey: "sk_test_demo123", customers: { northstar: customer } }, client);
  const ledger = new InMemoryActionLedger();
  const auditLedger = new AuditLedger();
  const runId = "run_workflow_stripe_01";
  const record = (eventType: string, metadata: Record<string, string | number | boolean | null>): void => {
    auditLedger.append(runId, eventType, metadata, "2026-09-13T00:00:00Z");
  };
  let current: RunState = "CREATED";
  let observed: StripeSubscriptionSnapshot | undefined;

  return {
    startInspection: async () => {
      current = transitionRun(current, "START_INSPECTION");
      record("INSPECTION_STARTED", { provider: "stripe" });
      observed = await adapter.readCustomer("northstar");
      const mismatched = observed.unitAmount !== customer.grandfatheredUnitAmount || observed.quantity !== customer.quantity;
      current = transitionRun(current, mismatched ? "MISMATCHES_FOUND" : "NO_MISMATCH");
      record(mismatched ? "MISMATCHES_FOUND" : "NO_MISMATCH", { provider: "stripe" });
      return observed;
    },
    requestApproval: () => {
      current = transitionRun(current, "REQUEST_APPROVAL");
      record("APPROVAL_REQUESTED", { provider: "stripe" });
    },
    approve: () => {
      current = transitionRun(current, "APPROVE");
      record("APPROVAL_GRANTED", { provider: "stripe" });
    },
    recover: async () => {
      if (!observed) throw new Error("Inspection is required before recovery.");
      current = transitionRun(current, "START_RECOVERY");
      const result = await executeStripeRecovery({
        actionId: "action_workflow_stripe_01",
        runId,
        customerAlias: "northstar",
        expected: observed,
        idempotencyKey: "run_workflow_stripe_recovery_01",
        now: "2026-09-13T00:00:00Z",
      }, adapter, ledger);
      if (result.status === "FAILED") current = transitionRun(current, "PARTIAL_RECOVERY");
      else current = transitionRun(current, "START_VERIFICATION");
      record(result.status === "FAILED" ? "RECOVERY_FAILED" : "RECOVERY_COMPLETED", { provider: "stripe", status: result.status });
      return result.status;
    },
    verify: async () => {
      if (current !== "VERIFYING") return false;
      const final = await adapter.readCustomer("northstar");
      const valid = final.status === "active" && final.unitAmount === 9900 && final.quantity === 87 && final.latestInvoiceId === null;
      current = transitionRun(current, valid ? "VERIFY" : "VERIFICATION_FAILED");
      record(valid ? "VERIFIED" : "VERIFICATION_FAILED", { provider: "stripe", checks: 4 });
      return valid;
    },
    state: () => current,
    audit: () => auditLedger.list(),
  };
}
