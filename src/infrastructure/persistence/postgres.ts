import postgres, { type Sql } from "postgres";
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

type RunRow = { run_id: string; status: string; plan_hash: string | null; version: number; projection: Record<string, unknown>; created_at: string; updated_at: string };
type ActionRow = { run_id: string; action_id: string; action_type: string; idempotency_key: string; status: ActionRecord["status"]; result: Record<string, unknown> | null; created_at: string; updated_at: string };

function runRecord(row: RunRow): RunRecord {
  return { runId: row.run_id, status: RunStateSchema.parse(row.status), planHash: row.plan_hash, version: row.version, projection: JsonObjectSchema.parse(row.projection), createdAt: row.created_at, updatedAt: row.updated_at };
}

function actionRecord(row: ActionRow): ActionRecord {
  return { runId: row.run_id, actionId: row.action_id, actionType: row.action_type, idempotencyKey: row.idempotency_key, status: row.status, result: row.result ? JsonObjectSchema.parse(row.result) : null, createdAt: row.created_at, updatedAt: row.updated_at };
}

/** Durable deployment store for Neon or any PostgreSQL-compatible provider. */
export class PostgresPersistence {
  private readonly sql: Sql;

  constructor(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) throw new Error("DATABASE_URL is required for Postgres persistence.");
    this.sql = postgres(connectionString, { max: 10, prepare: false });
  }

  async migrate(): Promise<void> {
    await this.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        plan_hash TEXT,
        version INTEGER NOT NULL DEFAULT 1,
        projection JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS actions (
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        action_id TEXT NOT NULL,
        action_type TEXT NOT NULL,
        idempotency_key TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL,
        result JSONB,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (run_id, action_id)
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        run_id TEXT NOT NULL REFERENCES runs(run_id),
        sequence INTEGER NOT NULL,
        event_type TEXT NOT NULL,
        event JSONB NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (run_id, sequence)
      );
    `);
  }

  async createRun(input: { runId: string; status: RunState; planHash?: string | null; projection?: Record<string, unknown> }): Promise<RunRecord> {
    const runId = z.string().trim().min(1).max(128).parse(input.runId);
    const status = RunStateSchema.parse(input.status);
    const projection = JsonObjectSchema.parse(input.projection ?? {});
    const now = new Date().toISOString();
    const rows = await this.sql<RunRow[]>`INSERT INTO runs (run_id,status,plan_hash,version,projection,created_at,updated_at) VALUES (${runId},${status},${input.planHash ?? null},1,${JSON.stringify(projection)}::jsonb,${now},${now}) RETURNING *`;
    return runRecord(rows[0]);
  }

  async getRun(runId: string): Promise<RunRecord | null> {
    const rows = await this.sql<RunRow[]>`SELECT * FROM runs WHERE run_id = ${runId}`;
    return rows[0] ? runRecord(rows[0]) : null;
  }

  async transitionRun(runId: string, fromVersion: number, status: RunState, projection?: Record<string, unknown>): Promise<RunRecord> {
    const parsedStatus = RunStateSchema.parse(status);
    const nextProjection = projection ? JsonObjectSchema.parse(projection) : (await this.getRun(runId))?.projection ?? {};
    const now = new Date().toISOString();
    const rows = await this.sql<RunRow[]>`UPDATE runs SET status=${parsedStatus}, version=version+1, projection=${JSON.stringify(nextProjection)}::jsonb, updated_at=${now} WHERE run_id=${runId} AND version=${fromVersion} RETURNING *`;
    if (!rows[0]) throw new Error("Run version conflict or unknown run.");
    return runRecord(rows[0]);
  }

  async getActionByIdempotencyKey(idempotencyKey: string): Promise<ActionRecord | null> {
    const rows = await this.sql<ActionRow[]>`SELECT * FROM actions WHERE idempotency_key = ${idempotencyKey}`;
    return rows[0] ? actionRecord(rows[0]) : null;
  }

  async recordAction(input: Omit<ActionRecord, "createdAt" | "updatedAt">): Promise<ActionRecord> {
    const now = new Date().toISOString();
    const rows = await this.sql<ActionRow[]>`INSERT INTO actions (run_id,action_id,action_type,idempotency_key,status,result,created_at,updated_at) VALUES (${input.runId},${input.actionId},${input.actionType},${input.idempotencyKey},${input.status},${input.result ? JSON.stringify(JsonObjectSchema.parse(input.result)) : null}${input.result ? "::jsonb" : ""},${now},${now}) ON CONFLICT (run_id,action_id) DO UPDATE SET status=EXCLUDED.status,result=EXCLUDED.result,updated_at=EXCLUDED.updated_at RETURNING *`;
    return actionRecord(rows[0]);
  }

  async appendAuditEvent(event: AuditEvent): Promise<void> {
    const parsed = AuditEventSchema.parse(event);
    await this.sql`INSERT INTO audit_events (run_id,sequence,event_type,event,occurred_at) VALUES (${parsed.runId},${parsed.sequence},${parsed.eventType},${JSON.stringify(parsed)}::jsonb,${parsed.occurredAt})`;
  }

  async listAuditEvents(runId: string): Promise<AuditEvent[]> {
    const rows = await this.sql<Array<{ event: unknown }>>`SELECT event FROM audit_events WHERE run_id=${runId} ORDER BY sequence ASC`;
    return rows.map((row) => AuditEventSchema.parse(row.event));
  }

  async close(): Promise<void> { await this.sql.end({ timeout: 5 }); }
}
