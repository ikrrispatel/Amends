import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { createDemoApiRuntime, makeLocalMockProviderSet } from "../../application/demo-api";
import { createDemoRunRecord } from "../../domain/demo-run-repository";
import { buildRecoveryPlan, createDefaultRecoveryActions } from "../../domain/orchestration";
import { SqlitePersistence } from "./sqlite";
import { SqliteDemoRunRepository } from "./sqlite-demo-run-repository";

const buildValidPlan = () => {
  const approvedAt = "2026-09-13T20:00:00.000Z";
  const expiresAt = "2026-09-14T20:00:00.000Z";
  const actions = createDefaultRecoveryActions("RUN-123");

  return buildRecoveryPlan(
    "run-restart-2",
    "RUN-123",
    approvedAt,
    expiresAt,
    actions,
  );
};

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

test("reopens SQLite persistence without losing DemoRunRecord data", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "amends-demo-run-"));
  const dbPath = path.join(tempDir, "amends.sqlite");

  try {
    const repoOne = new SqliteDemoRunRepository(dbPath);
    const created = repoOne.create(
      createDemoRunRecord({
        runId: "run-restart-1",
        runCode: "RUN-123",
        currentState: "APPROVED",
        approvedAt: "2026-09-13T20:00:00.000Z",
        approvedBy: "U_APPROVER",
        executedActionIds: ["action-1"],
      }),
    );
    repoOne.close();

    const repoTwo = new SqliteDemoRunRepository(dbPath);
    const restored = repoTwo.get("run-restart-1");
    assert.ok(restored);
    assert.deepEqual(restored, created);
    repoTwo.close();
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("reopened SQLite state preserves execution idempotency checks", async () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "amends-idempotency-"));
  const dbPath = path.join(tempDir, "amends.sqlite");

  try {
    const repoOne = new SqliteDemoRunRepository(dbPath);
    const plan = buildValidPlan();
    const record = createDemoRunRecord({
      runId: "run-restart-2",
      runCode: "RUN-123",
      currentState: "APPROVED",
      approvedAt: "2026-09-13T20:00:00.000Z",
      approvedBy: "U_APPROVER",
      plan,
      executedActionIds: [plan.actions[0].actionId],
    });
    repoOne.create(record);
    repoOne.close();

    const repoTwo = new SqliteDemoRunRepository(dbPath);
    const runtime = createDemoApiRuntime({
      repository: repoTwo,
      providers: makeLocalMockProviderSet(),
      approverUserId: "U_APPROVER",
      defaultRunCode: "RUN-123",
    });

    const result = await runtime.orchestrator.executeRecovery("run-restart-2");
    assert.equal(result.currentState, "MANUAL_REVIEW");
    assert.equal(result.sanitizedFailure?.code, "PRECONDITION_FAILED");
    assert.match(result.sanitizedFailure?.message ?? "", /Duplicate action execution prevented/);
    assert.deepEqual(
      repoTwo.get("run-restart-2")?.executedActionIds,
      [plan.actions[0].actionId],
    );
    repoTwo.close();
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

test("reopened SQLite database keeps ordered audit events intact", () => {
  const tempDir = mkdtempSync(path.join(tmpdir(), "amends-audit-"));
  const dbPath = path.join(tempDir, "amends.sqlite");

  try {
    const storeOne = new SqlitePersistence(dbPath);
    storeOne.createRun({ runId: "run-audit-1", status: "CREATED" });
    storeOne.appendAuditEvent({ eventType: "INSPECTION_STARTED", runId: "run-audit-1", sequence: 0, occurredAt: "2026-09-13T20:00:00.000Z", metadata: { fromState: "CREATED", toState: "INSPECTING" } });
    storeOne.appendAuditEvent({ eventType: "VERIFICATION_PASSED", runId: "run-audit-1", sequence: 1, occurredAt: "2026-09-13T20:01:00.000Z", metadata: { checkCount: 3 } });
    storeOne.close();

    const storeTwo = new SqlitePersistence(dbPath);
    const events = storeTwo.listAuditEvents("run-audit-1").map((event) => event.eventType);
    assert.deepEqual(events, ["INSPECTION_STARTED", "VERIFICATION_PASSED"]);
    storeTwo.close();
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
});
