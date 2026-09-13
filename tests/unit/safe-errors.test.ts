import { describe, expect, it } from "vitest";
import { toSafeError } from "../../src/infrastructure/safe-errors.js";

describe("safe errors", () => {
  it("redacts provider details", () => {
    const result = toSafeError(new Error("Stripe secret sk_live_hidden timeout at https://internal.example"));
    expect(result).toEqual({ code: "PROVIDER_UNAVAILABLE", message: "The provider is temporarily unavailable." });
    expect(JSON.stringify(result)).not.toContain("sk_live");
    expect(JSON.stringify(result)).not.toContain("internal.example");
  });

  it("maps precondition and malformed errors to bounded codes", () => {
    expect(toSafeError(new Error("precondition mismatch")).code).toBe("PRECONDITION_FAILED");
    expect(toSafeError(new Error("malformed request")).code).toBe("INVALID_INPUT");
    expect(toSafeError({ secret: "do-not-return" }).code).toBe("INTERNAL_ERROR");
  });
});
