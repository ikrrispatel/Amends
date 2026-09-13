import { describe, expect, it } from "vitest";
import { InMemoryActionLedger } from "../../src/infrastructure/action-ledger.js";

const input = {
  id: "action_demo_001",
  runId: "run_demo_001",
  actionType: "RESTORE_STRIPE_GRANDFATHERED_PRICE",
  idempotencyKey: "run_demo_stripe_001",
  preconditionsJson: '{"price":12900,"quantity":87}',
  createdAt: "2026-09-13T00:00:00Z",
} as const;

describe("InMemoryActionLedger", () => {
  it("claims once and replays the same idempotency key", () => {
    const ledger = new InMemoryActionLedger();
    expect(ledger.claim(input).kind).toBe("NEW");
    expect(ledger.claim(input).kind).toBe("REPLAY");
  });

  it("rejects a key reused for another action", () => {
    const ledger = new InMemoryActionLedger();
    ledger.claim(input);
    expect(ledger.claim({ ...input, actionType: "RESTORE_NOTION_PRICING_POLICY" }).kind).toBe("CONFLICT");
  });

  it("finalizes only a claimed action", () => {
    const ledger = new InMemoryActionLedger();
    ledger.claim(input);
    const result = ledger.finish(input.idempotencyKey, input.actionType, "COMPLETED", '{"ok":true}', "2026-09-13T00:00:01Z");
    expect(result.status).toBe("COMPLETED");
    expect(() => ledger.finish(input.idempotencyKey, input.actionType, "FAILED", '{"ok":false}', "2026-09-13T00:00:02Z")).toThrow("Action cannot be finalized.");
  });
});
