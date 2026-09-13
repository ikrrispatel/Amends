import { createRequire } from "node:module";
import type { ActionClaim, ActionLedger, ActionRecord } from "./action-ledger.js";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as typeof import("node:sqlite");
type Database = InstanceType<typeof DatabaseSync>;

type SqlActionRow = {
  id: string;
  run_id: string;
  action_type: string;
  idempotency_key: string;
  preconditions_json: string;
  status: "CLAIMED" | "COMPLETED" | "FAILED";
  result_json: string | null;
  created_at: string;
  updated_at: string;
};

function record(row: SqlActionRow): ActionRecord {
  return {
    id: row.id,
    runId: row.run_id,
    actionType: row.action_type,
    idempotencyKey: row.idempotency_key,
    preconditionsJson: row.preconditions_json,
    status: row.status,
    ...(row.result_json === null ? {} : { resultJson: row.result_json }),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Restart-safe action ledger for the local hackathon runner. */
export class SqliteActionLedger implements ActionLedger {
  private readonly database: Database;

  constructor(filename: string) {
    this.database = new DatabaseSync(filename);
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS actions (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        preconditions_json TEXT NOT NULL,
        status TEXT NOT NULL,
        result_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  claim(input: Omit<ActionRecord, "status" | "updatedAt"> & { readonly status?: never }): ActionClaim {
    const existing = this.database.prepare("SELECT * FROM actions WHERE idempotency_key = ?").get(input.idempotencyKey) as SqlActionRow | undefined;
    if (existing) {
      return { kind: existing.action_type === input.actionType ? "REPLAY" : "CONFLICT", record: record(existing) };
    }
    this.database.prepare(`INSERT INTO actions (id, run_id, action_type, idempotency_key, preconditions_json, status, result_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'CLAIMED', NULL, ?, ?)`)
      .run(input.id, input.runId, input.actionType, input.idempotencyKey, input.preconditionsJson, input.createdAt, input.createdAt);
    const created = this.database.prepare("SELECT * FROM actions WHERE idempotency_key = ?").get(input.idempotencyKey) as SqlActionRow;
    return { kind: "NEW", record: record(created) };
  }

  finish(idempotencyKey: string, actionType: string, status: "COMPLETED" | "FAILED", resultJson: string, updatedAt: string): ActionRecord {
    const result = this.database.prepare("UPDATE actions SET status = ?, result_json = ?, updated_at = ? WHERE idempotency_key = ? AND action_type = ? AND status = 'CLAIMED'")
      .run(status, resultJson, updatedAt, idempotencyKey, actionType);
    void result;
    const updated = this.database.prepare("SELECT * FROM actions WHERE idempotency_key = ?").get(idempotencyKey) as SqlActionRow | undefined;
    if (!updated || updated.action_type !== actionType || updated.status === "CLAIMED") throw new Error("Action cannot be finalized.");
    return record(updated);
  }

  close(): void {
    this.database.close();
  }
}
