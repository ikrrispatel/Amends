import { describe, expect, it } from "vitest";
import { createSyntheticStripeWorkflow } from "../../src/application/stripe-recovery-workflow.js";

describe("Stripe recovery workflow", () => {
  it("enforces inspection, approval, recovery, and verification", async () => {
    const workflow = createSyntheticStripeWorkflow();
    const observed = await workflow.startInspection();
    expect(observed.unitAmount).toBe(12900);
    expect(workflow.state()).toBe("MISMATCH_FOUND");
    workflow.requestApproval();
    workflow.approve();
    expect(await workflow.recover()).toBe("COMMITTED");
    expect(await workflow.verify()).toBe(true);
    expect(workflow.state()).toBe("VERIFIED");
    expect(workflow.audit()).toHaveLength(6);
    expect(workflow.audit()[0]!.eventType).toBe("INSPECTION_STARTED");
  });

  it("rejects recovery before approval", async () => {
    const workflow = createSyntheticStripeWorkflow();
    await workflow.startInspection();
    await expect(workflow.recover()).rejects.toThrow("Illegal run transition");
  });
});
