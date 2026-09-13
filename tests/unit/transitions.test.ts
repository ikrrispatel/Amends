import { describe, expect, it } from "vitest";
import { transitionRun } from "../../src/domain/transitions.js";

describe("run transitions", () => {
  it("allows the approved recovery path", () => {
    let state = transitionRun("CREATED", "START_INSPECTION");
    state = transitionRun(state, "MISMATCHES_FOUND");
    state = transitionRun(state, "REQUEST_APPROVAL");
    state = transitionRun(state, "APPROVE");
    state = transitionRun(state, "START_RECOVERY");
    state = transitionRun(state, "START_VERIFICATION");
    expect(transitionRun(state, "VERIFY")).toBe("VERIFIED");
  });

  it("rejects bypassing approval", () => {
    expect(() => transitionRun("MISMATCH_FOUND", "START_RECOVERY")).toThrow("Illegal run transition");
  });

  it("makes failure states terminal", () => {
    expect(() => transitionRun("RECOVERY_PARTIAL", "START_VERIFICATION")).toThrow("Illegal run transition");
    expect(() => transitionRun("VERIFIED", "START_RECOVERY")).toThrow("Illegal run transition");
  });
});
