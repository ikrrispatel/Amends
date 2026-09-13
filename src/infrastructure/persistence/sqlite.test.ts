import assert from "node:assert/strict";
import test from "node:test";
import { SqlitePersistence } from "./sqlite.js";

test("persists runs with optimistic versioning", () => {
  const store = new SqlitePersistence(":memory:");
  const created = store.createRun({ runId: "run-1", status: "CREATED" });
  const updated = store.transitionRun("run-1", created.version, "INSPECTING");
  assert.equal(updated.status, "INSPECTING");
  assert.equal(updated.version, 2);
  assert.throws(() => store.transitionRun("run-1", created.version, "MISMATCH_FOUND"), /version conflict/);
  store.close();
});

test("deduplicates action records by deterministic idempotency key", () => {
  const store = new SqlitePersistence(":memory:");
  store.createRun({ runId: "run-1", status: "CREATED" });
  const input = { runId: "run-1", actionId: "action-1", actionType: "RESTORE_STRIPE_GRANDFATHERED_PRICE", idempotencyKey: "key-1", status: "PENDING" as const, result: null };
  store.recordAction(input);
  const updated = store.recordAction({ ...input, status: "SUCCEEDED", result: { verified: true } });
  assert.equal(updated.status, "SUCCEEDED");
  assert.deepEqual(updated.result, { verified: true });
  assert.equal(store.getActionByIdempotencyKey("key-1")?.status, "SUCCEEDED");
  store.close();
});

test("stores validated append-only audit events in sequence order", () => {
  const store = new SqlitePersistence(":memory:");
  store.createRun({ runId: "run-1", status: "CREATED" });
  store.appendAuditEvent({ eventType: "INSPECTION_STARTED", runId: "run-1", sequence: 0, occurredAt: "2026-09-13T20:00:00.000Z", metadata: { fromState: "CREATED", toState: "INSPECTING" } });
  store.appendAuditEvent({ eventType: "VERIFICATION_PASSED", runId: "run-1", sequence: 1, occurredAt: "2026-09-13T20:01:00.000Z", metadata: { checkCount: 3 } });
  assert.deepEqual(store.listAuditEvents("run-1").map((event) => event.eventType), ["INSPECTION_STARTED", "VERIFICATION_PASSED"]);
  store.close();
});
