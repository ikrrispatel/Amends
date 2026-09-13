import postgres, { type Sql } from 'postgres';
import { z } from 'zod';
import { AuditEventSchema, type AuditEvent } from '@/domain/audit';
import { DemoRunRecordSchema, type DemoRunRecord } from '@/domain/demo-run-repository';

function decodeJson(value: unknown): unknown {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

type DemoRunRow = { run_id: string; record_json: unknown; created_at: string; updated_at: string };
type ActionRow = { idempotency_key: string; run_id: string; action_json: unknown };
type AuditRow = { event_json: unknown };

/** Async durable repository for Neon/Postgres. The app boundary must await these methods. */
export class PostgresDemoRunRepository {
  private readonly sql: Sql;

  constructor(connectionString = process.env.DATABASE_URL) {
    if (!connectionString) throw new Error('DATABASE_URL is required for Postgres persistence.');
    this.sql = postgres(connectionString, { max: 10, prepare: false });
  }

  async migrate(): Promise<void> {
    await this.sql.unsafe(`
      CREATE TABLE IF NOT EXISTS amends_schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS demo_runs (
        run_id TEXT PRIMARY KEY,
        record_json JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL
      );
      CREATE TABLE IF NOT EXISTS demo_actions (
        idempotency_key TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES demo_runs(run_id),
        action_json JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS demo_audit_events (
        run_id TEXT NOT NULL REFERENCES demo_runs(run_id),
        sequence INTEGER NOT NULL,
        event_json JSONB NOT NULL,
        occurred_at TIMESTAMPTZ NOT NULL,
        PRIMARY KEY (run_id, sequence)
      );
      INSERT INTO amends_schema_migrations (version) VALUES (1) ON CONFLICT (version) DO NOTHING;
    `);
  }

  async get(runId: string): Promise<DemoRunRecord | undefined> {
    const rows = await this.sql<DemoRunRow[]>`SELECT run_id, record_json, created_at, updated_at FROM demo_runs WHERE run_id=${runId}`;
    return rows[0] ? DemoRunRecordSchema.parse(decodeJson(rows[0].record_json)) : undefined;
  }

  async create(record: DemoRunRecord): Promise<DemoRunRecord> {
    const parsed = DemoRunRecordSchema.parse(record);
    const existing = await this.get(parsed.runId);
    if (existing) throw new Error(`Duplicate demo run ID rejected: ${parsed.runId}`);
    const rows = await this.sql<DemoRunRow[]>`INSERT INTO demo_runs (run_id,record_json,created_at,updated_at) VALUES (${parsed.runId},${this.sql.json(parsed)},${parsed.createdAt},${parsed.updatedAt}) RETURNING run_id,record_json,created_at,updated_at`;
    return DemoRunRecordSchema.parse(decodeJson(rows[0].record_json));
  }

  async save(record: DemoRunRecord): Promise<DemoRunRecord> {
    const parsed = DemoRunRecordSchema.parse(record);
    const rows = await this.sql<DemoRunRow[]>`INSERT INTO demo_runs (run_id,record_json,created_at,updated_at) VALUES (${parsed.runId},${this.sql.json(parsed)},${parsed.createdAt},${parsed.updatedAt}) ON CONFLICT (run_id) DO UPDATE SET record_json=EXCLUDED.record_json,updated_at=EXCLUDED.updated_at RETURNING run_id,record_json,created_at,updated_at`;
    return DemoRunRecordSchema.parse(decodeJson(rows[0].record_json));
  }

  async list(): Promise<DemoRunRecord[]> {
    const rows = await this.sql<DemoRunRow[]>`SELECT run_id,record_json,created_at,updated_at FROM demo_runs ORDER BY created_at ASC,run_id ASC`;
    return rows.map((row) => DemoRunRecordSchema.parse(decodeJson(row.record_json)));
  }

  async reset(): Promise<void> {
    await this.sql`TRUNCATE demo_audit_events, demo_actions, demo_runs`;
  }

  async delete(runId: string): Promise<void> {
    await this.sql`DELETE FROM demo_audit_events WHERE run_id=${runId}`;
    await this.sql`DELETE FROM demo_actions WHERE run_id=${runId}`;
    await this.sql`DELETE FROM demo_runs WHERE run_id=${runId}`;
  }

  async recordAction(idempotencyKey: string, runId: string, action: Record<string, unknown>): Promise<Record<string, unknown>> {
    const parsedAction = z.record(z.string(), z.unknown()).parse(action);
    const rows = await this.sql<ActionRow[]>`INSERT INTO demo_actions (idempotency_key,run_id,action_json) VALUES (${idempotencyKey},${runId},${this.sql.json(parsedAction as never)}) ON CONFLICT (idempotency_key) DO NOTHING RETURNING idempotency_key,run_id,action_json`;
    if (rows[0]) return z.record(z.string(), z.unknown()).parse(decodeJson(rows[0].action_json));
    const existing = await this.sql<ActionRow[]>`SELECT idempotency_key,run_id,action_json FROM demo_actions WHERE idempotency_key=${idempotencyKey}`;
    return z.record(z.string(), z.unknown()).parse(decodeJson(existing[0].action_json));
  }

  async appendAuditEvent(event: AuditEvent): Promise<void> {
    const parsed = AuditEventSchema.parse(event);
    await this.sql`INSERT INTO demo_audit_events (run_id,sequence,event_json,occurred_at) VALUES (${parsed.runId},${parsed.sequence},${this.sql.json(parsed)},${parsed.occurredAt})`;
  }

  async listAuditEvents(runId: string): Promise<AuditEvent[]> {
    const rows = await this.sql<AuditRow[]>`SELECT event_json FROM demo_audit_events WHERE run_id=${runId} ORDER BY sequence ASC`;
    return rows.map((row) => AuditEventSchema.parse(decodeJson(row.event_json)));
  }

  async close(): Promise<void> { await this.sql.end({ timeout: 5 }); }
}
