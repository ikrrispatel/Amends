import { describe, expect, it } from "vitest";
import { validateApproval } from "../../src/application/approval.js";
import { RecoveryApi } from "../../src/application/recovery-api.js";
import { summarizeRecovery } from "../../src/application/recovery-result.js";

describe("approval and recovery API", () => {
  it("rejects expired approvals and wrong actors", () => {
    expect(validateApproval("APPROVE RUN1", "intruder", "operator", "RUN1", "2026-09-13T00:00:10Z", "2026-09-13T00:00:01Z")).toEqual({ ok: false, reason: "WRONG_ACTOR" });
    expect(validateApproval("APPROVE RUN1", "operator", "operator", "RUN1", "2026-09-13T00:00:10Z", "2026-09-13T00:00:10Z")).toEqual({ ok: false, reason: "EXPIRED" });
  });

  it("accepts only the exact current approval command", () => {
    expect(validateApproval("approve RUN1", "operator", "operator", "RUN1", "2026-09-13T00:00:10Z", "2026-09-13T00:00:01Z")).toEqual({ ok: false, reason: "INVALID_COMMAND" });
    expect(validateApproval("APPROVE RUN1", "operator", "operator", "RUN1", "2026-09-13T00:00:10Z", "2026-09-13T00:00:01Z")).toEqual({ ok: true, runCode: "RUN1" });
  });

  it("exposes sanitized run API states and partial outcomes", () => {
    const api = new RecoveryApi();
    api.create("run_api_001", "RUN1", "2026-09-13T00:00:10Z", "operator");
    api.requestApproval("run_api_001", "2026-09-13T00:00:01Z");
    expect(api.approve("run_api_001", "APPROVE RUN1", "operator", "2026-09-13T00:00:02Z").status).toBe("APPROVED");
    const summary = summarizeRecovery([{ action: "stripe", status: "COMMITTED" }, { action: "email", status: "IRREVERSIBLE" }]);
    expect(api.finish("run_api_001", summary).status).toBe("PARTIAL");
  });
});
