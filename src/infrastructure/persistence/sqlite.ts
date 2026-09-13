import Database from "better-sqlite3";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { z } from "zod";
import { AuditEventSchema, type AuditEvent } from "../../domain/audit.js";
import { RunStateSchema, type RunState } from "../../domain/run-states.js";

const JsonObjectSchema = z.record(z.string(), z.unknown());

export type RunRecord = {
  readonly runId: string;
  readonly status: RunState;
  readonly planHash: string | null;
  readonly version: number;
  readonly projection: Record<string, unknown>;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ActionRecord = {
  readonly runId: string;
  readonly actionId: string;
  readonly actionType: string;
  readonly idempotencyKey: string;
  readonly status: "PENDING" | "SUCCEEDED" | "FAILED" | "SKIPPED";
  readonly result: Record<string, unknown> | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

type RunRow = { run_id: string; status: string; plan_hash: string | null; version: number; projection_json: string; created_at: string; updated_at: string };
type ActionRow = { run_id: string; action_id: string; action_type: string; idempotency_key: string; status: ActionRecord["status"]; result_json: string | null; created_at: string; updated_at: string };

export class SqlitePersistence {
  readonly db: Database.Database;

  constructor(filename = process.env.AMENDS_DATABASE_PATH ?? "./data/amends.sqlite") {
    if (filename !== ":memory:") mkdirSync(dirname(filename), { recursive: true });
    this.db = new Database(filename);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        plan_hash TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        projection_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS actions (
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        action_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        result_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (run_id, action_id)
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        sequence INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        event_json TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        PRIMARY KEY (run_id, sequence)
      );
    `);
  }

  createRun(input: { runId: string; status: RunState; planHash?: string | null; projection?: Record<string, unknown> }): RunRecord {
    const now = new Date().toISOString();
    const runId = z.string().trim().min(1).max(128).parse(input.runId);
    const status = RunStateSchema.parse(input.status);
    const projection = JsonObjectSchema.parse(input.projection ?? {});
    this.db.prepare(`INSERT INTO runs (run_id,status,plan_hash,version,projection_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)`)
      .run(runId, status, input.planHash ?? null, 1, JSON.stringify(projection), now, now);
    return this.getRun(runId)!;
  }

  getRun(runId: string): RunRecord | null {
    const row = this.db.prepare("SELECT * FROM runs WHERE run_id = ?").get(runId) as RunRow | undefined;
    if (!row) return null;
    return { runId: row.run_id, status: RunStateSchema.parse(row.status), planHash: row.plan_hash, version: row.version, projection: JsonObjectSchema.parse(JSON.parse(row.projection_json)), createdAt: row.created_at, updatedAt: row.updated_at };
  }

  transitionRun(runId: string, fromVersion: number, status: RunState, projection?: Record<string, unknown>): RunRecord {
    const parsedStatus = RunStateSchema.parse(status);
    const parsedProjection = projection ? JsonObjectSchema.parse(projection) : this.getRun(runId)?.projection ?? {};
    const now = new Date().toISOString();
    const result = this.db.prepare("UPDATE runs SET status = ?, version = version + 1, projection_json = ?, updated_at = ? WHERE run_id = ? AND version = ?")
      .run(parsedStatus, JSON.stringify(parsedProjection), now, runId, fromVersion);
    if (result.changes !== 1) throw new Error("Run version conflict or unknown run.");
    return this.getRun(runId)!;
  }

  getActionByIdempotencyKey(idempotencyKey: string): ActionRecord | null {
    const row = this.db.prepare("SELECT * FROM actions WHERE idempotency_key = ?").get(idempotencyKey) as ActionRow | undefined;
    if (!row) return null;
    return { runId: row.run_id, actionId: row.action_id, actionType: row.action_type, idempotencyKey: row.idempotency_key, status: row.status, result: row.result_json ? JsonObjectSchema.parse(JSON.parse(row.result_json)) : null, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  recordAction(input: Omit<ActionRecord, "createdAt" | "updatedAt">): ActionRecord {
    const now = new Date().toISOString();
    this.db.prepare(`INSERT INTO actions (run_id,action_id,action_type,idempotency_key,status,result_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(run_id,action_id) DO UPDATE SET status=excluded.status,result_json=excluded.result_json,updated_at=excluded.updated_at`)
      .run(input.runId, input.actionId, input.actionType, input.idempotencyKey, input.status, input.result ? JSON.stringify(JsonObjectSchema.parse(input.result)) : null, now, now);
    const row = this.db.prepare("SELECT * FROM actions WHERE run_id = ? AND action_id = ?").get(input.runId, input.actionId) as ActionRow;
    return { runId: row.run_id, actionId: row.action_id, actionType: row.action_type, idempotencyKey: row.idempotency_key, status: row.status, result: row.result_json ? JsonObjectSchema.parse(JSON.parse(row.result_json)) : null, createdAt: row.created_at, updatedAt: row.updated_at };
  }

  appendAuditEvent(event: AuditEvent): void {
    const parsed = AuditEventSchema.parse(event);
    this.db.prepare("INSERT INTO audit_events (run_id,sequence,event_type,event_json,occurred_at) VALUES (?,?,?,?,?)")
      .run(parsed.runId, parsed.sequence, parsed.eventType, JSON.stringify(parsed), parsed.occurredAt);
  }

  listAuditEvents(runId: string): AuditEvent[] {
    const rows = this.db.prepare("SELECT event_json FROM audit_events WHERE run_id = ? ORDER BY sequence ASC").all(runId) as Array<{ event_json: string }>;
    return rows.map((row) => AuditEventSchema.parse(JSON.parse(row.event_json)));
  }

  close(): void { this.db.close(); }
}
