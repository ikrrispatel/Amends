import { describe, expect, it } from "vitest";
import { InMemoryIdempotencyStore } from "../../src/infrastructure/idempotency.js";

describe("InMemoryIdempotencyStore", () => {
  it("allows one claim and replays the same action", () => {
    const store = new InMemoryIdempotencyStore();
    const first = store.claim("run_demo_action_001", "RESTORE_STRIPE", "2026-09-13T00:00:00Z");
    const second = store.claim("run_demo_action_001", "RESTORE_STRIPE", "2026-09-13T00:00:01Z");

    expect(first.kind).toBe("NEW");
    expect(second.kind).toBe("REPLAY");
    expect(second.record.status).toBe("CLAIMED");
  });

  it("rejects reuse of a key for another action", () => {
    const store = new InMemoryIdempotencyStore();
    store.claim("run_demo_action_002", "RESTORE_STRIPE", "2026-09-13T00:00:00Z");

    const conflict = store.claim(
      "run_demo_action_002",
      "RESTORE_NOTION",
      "2026-09-13T00:00:01Z",
    );
    expect(conflict.kind).toBe("CONFLICT");
  });

  it("does not finalize a missing or already-finalized record", () => {
    const store = new InMemoryIdempotencyStore();
    expect(() =>
      store.complete("run_demo_action_003", "RESTORE_STRIPE", "ok", "2026-09-13T00:00:00Z"),
    ).toThrow("Idempotency record cannot be finalized.");

    store.claim("run_demo_action_004", "RESTORE_STRIPE", "2026-09-13T00:00:00Z");
    store.complete("run_demo_action_004", "RESTORE_STRIPE", "ok", "2026-09-13T00:00:01Z");
    expect(() =>
      store.complete("run_demo_action_004", "RESTORE_STRIPE", "again", "2026-09-13T00:00:02Z"),
    ).toThrow("Idempotency record cannot be finalized.");
  });
});
