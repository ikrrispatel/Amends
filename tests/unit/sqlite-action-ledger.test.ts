import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SqliteActionLedger } from "../../src/infrastructure/sqlite-action-ledger.js";

describe("SqliteActionLedger", () => {
  it("replays an action after reopening the database", () => {
    const directory = mkdtempSync(join(tmpdir(), "amends-ledger-"));
    const filename = join(directory, "run.db");
    const input = {
      id: "action_sqlite_001",
      runId: "run_sqlite_001",
      actionType: "RESTORE_STRIPE",
      idempotencyKey: "run_sqlite_action_001",
      preconditionsJson: "{}",
      createdAt: "2026-09-13T00:00:00Z",
    } as const;
    const first = new SqliteActionLedger(filename);
    expect(first.claim(input).kind).toBe("NEW");
    first.finish(input.idempotencyKey, input.actionType, "COMPLETED", '{"ok":true}', "2026-09-13T00:00:01Z");
    first.close();
    const reopened = new SqliteActionLedger(filename);
    expect(reopened.claim(input).kind).toBe("REPLAY");
    reopened.close();
    rmSync(directory, { recursive: true, force: true });
  });
});
