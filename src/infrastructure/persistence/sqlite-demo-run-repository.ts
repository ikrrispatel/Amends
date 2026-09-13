import { DemoRunRecordSchema, type DemoRunRecord, type DemoRunRepository } from '@/domain/demo-run-repository';

import { SqlitePersistence } from './sqlite';

export class SqliteDemoRunRepository implements DemoRunRepository {
  private readonly store: SqlitePersistence;

  constructor(filename = process.env.AMENDS_DATABASE_PATH ?? './data/amends.sqlite') {
    this.store = new SqlitePersistence(filename);
    this.store.db.exec(`
      CREATE TABLE IF NOT EXISTS demo_runs (
        run_id TEXT PRIMARY KEY,
        record_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
  }

  get(runId: string): DemoRunRecord | undefined {
    const row = this.store.db
      .prepare('SELECT record_json FROM demo_runs WHERE run_id = ?')
      .get(runId) as { record_json: string } | undefined;

    if (!row) {
      return undefined;
    }

    return DemoRunRecordSchema.parse(JSON.parse(row.record_json));
  }

  create(record: DemoRunRecord): DemoRunRecord {
    const parsed = DemoRunRecordSchema.parse(record);
    const existing = this.get(parsed.runId);
    if (existing) {
      throw new Error(`Duplicate demo run ID rejected: ${parsed.runId}`);
    }

    this.store.db
      .prepare(
        'INSERT INTO demo_runs (run_id, record_json, created_at, updated_at) VALUES (?, ?, ?, ?)',
      )
      .run(parsed.runId, JSON.stringify(parsed), parsed.createdAt, parsed.updatedAt);

    return this.get(parsed.runId)!;
  }

  save(record: DemoRunRecord): DemoRunRecord {
    const parsed = DemoRunRecordSchema.parse(record);
    this.store.db
      .prepare(
        `INSERT INTO demo_runs (run_id, record_json, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(run_id) DO UPDATE SET
           record_json = excluded.record_json,
           updated_at = excluded.updated_at`,
      )
      .run(parsed.runId, JSON.stringify(parsed), parsed.createdAt, parsed.updatedAt);

    return this.get(parsed.runId)!;
  }

  list(): DemoRunRecord[] {
    const rows = this.store.db
      .prepare('SELECT record_json FROM demo_runs ORDER BY created_at ASC, run_id ASC')
      .all() as Array<{ record_json: string }>;

    return rows.map((row) => DemoRunRecordSchema.parse(JSON.parse(row.record_json)));
  }

  reset(): void {
    this.store.db.prepare('DELETE FROM demo_runs').run();
  }

  close(): void {
    this.store.close();
  }
}
