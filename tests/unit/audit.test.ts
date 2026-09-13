import { describe, expect, it } from "vitest";
import { AuditLedger } from "../../src/infrastructure/audit.js";

describe("AuditLedger", () => {
  it("builds and verifies a hash chain", () => {
    const ledger = new AuditLedger();
    ledger.append("run_audit_001", "INSPECTION_STARTED", { provider: "stripe" }, "2026-09-13T00:00:00Z");
    ledger.append("run_audit_001", "RECOVERY_COMPLETED", { action: "stripe_restore", ok: true }, "2026-09-13T00:00:01Z");
    expect(ledger.verify()).toBe(true);
    expect(ledger.list()).toHaveLength(2);
  });

  it("returns a defensive audit snapshot", () => {
    const ledger = new AuditLedger();
    ledger.append("run_audit_002", "INSPECTION_STARTED", { provider: "stripe" }, "2026-09-13T00:00:00Z");
    expect(ledger.verify()).toBe(true);
    expect(ledger.list()[0]!.metadata.provider).toBe("stripe");
  });

  it("rejects invalid event identifiers", () => {
    const ledger = new AuditLedger();
    expect(() => ledger.append("bad", "EVENT", {}, "2026-09-13T00:00:00Z")).toThrow("Invalid audit run ID");
    expect(() => ledger.append("run_audit_003", "bad-event", {}, "2026-09-13T00:00:00Z")).toThrow("Invalid audit event type");
  });
});
