import { z } from 'zod';

import { BusinessMismatchSchema } from './orchestration';
import { RecoveryPlanV1Schema } from './recovery';
import { RunStateSchema } from './run-states';
import {
  NotionNormalizedStateSchema,
  SlackNormalizedStateSchema,
  StripeNormalizedStateSchema,
} from './normalized-state';
import { SanitizedFailureSchema } from './idempotency';

export const VerificationCheckSchema = z
  .object({
    id: z.string().trim().min(1).max(128),
    passed: z.boolean(),
    detail: z.string().trim().min(1).max(500),
  })
  .strict();

export const VerificationResultSchema = z
  .object({
    passes: z.boolean(),
    checks: z.array(VerificationCheckSchema).min(1).max(10),
  })
  .strict();

export type VerificationResult = z.infer<typeof VerificationResultSchema>;

export const DemoRunRecordSchema = z
  .object({
    runId: z.string().trim().min(1).max(128),
    runCode: z.string().trim().min(1).max(128).nullable().default(null),
    currentState: RunStateSchema,
    contract: z.any().nullable().default(null),
    normalizedSnapshots: z
      .object({
        stripe: StripeNormalizedStateSchema.nullable().default(null),
        notion: NotionNormalizedStateSchema.nullable().default(null),
        slack: SlackNormalizedStateSchema.nullable().default(null),
      })
      .strict(),
    mismatches: z.array(BusinessMismatchSchema).default([]),
    exposureCents: z.number().int().nonnegative().default(0),
    plan: RecoveryPlanV1Schema.nullable().default(null),
    verification: VerificationResultSchema.nullable().default(null),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
    approvedAt: z.string().datetime().nullable().default(null),
    approvedBy: z.string().trim().max(128).nullable().default(null),
    executedActionIds: z.array(z.string().trim().min(1).max(128)).default([]),
    sanitizedFailure: SanitizedFailureSchema.nullable().default(null),
  })
  .strict();

export type DemoRunRecord = z.infer<typeof DemoRunRecordSchema>;

export interface DemoRunRepository {
  get(runId: string): DemoRunRecord | undefined | Promise<DemoRunRecord | undefined>;
  create(record: DemoRunRecord): DemoRunRecord | Promise<DemoRunRecord>;
  save(record: DemoRunRecord): DemoRunRecord | Promise<DemoRunRecord>;
  list(): DemoRunRecord[] | Promise<DemoRunRecord[]>;
}

export class InMemoryDemoRunRepository implements DemoRunRepository {
  private readonly store = new Map<string, DemoRunRecord>();

  get(runId: string): DemoRunRecord | undefined {
    const value = this.store.get(runId);
    return value ? structuredClone(value) : undefined;
  }

  create(record: DemoRunRecord): DemoRunRecord {
    const parsed = DemoRunRecordSchema.parse(record);
    if (this.store.has(parsed.runId)) {
      throw new Error(`Duplicate demo run ID rejected: ${parsed.runId}`);
    }

    const value = structuredClone(parsed);
    this.store.set(parsed.runId, value);
    return structuredClone(value);
  }

  save(record: DemoRunRecord): DemoRunRecord {
    const parsed = DemoRunRecordSchema.parse(record);
    const value = structuredClone(parsed);
    this.store.set(parsed.runId, value);
    return structuredClone(value);
  }

  list(): DemoRunRecord[] {
    return Array.from(this.store.values()).map((entry) => structuredClone(entry));
  }
}

export function createDemoRunRecord(input: Partial<DemoRunRecord> & Pick<DemoRunRecord, 'runId' | 'currentState'>): DemoRunRecord {
  const timestamp = new Date().toISOString();
  const record = DemoRunRecordSchema.parse({
    runId: input.runId,
    runCode: input.runCode ?? null,
    currentState: input.currentState,
    contract: input.contract ?? null,
    normalizedSnapshots: input.normalizedSnapshots ?? {
      stripe: null,
      notion: null,
      slack: null,
    },
    mismatches: input.mismatches ?? [],
    exposureCents: input.exposureCents ?? 0,
    plan: input.plan ?? null,
    verification: input.verification ?? null,
    createdAt: input.createdAt ?? timestamp,
    updatedAt: input.updatedAt ?? timestamp,
    approvedAt: input.approvedAt ?? null,
    approvedBy: input.approvedBy ?? null,
    executedActionIds: input.executedActionIds ?? [],
    sanitizedFailure: input.sanitizedFailure ?? null,
  });

  return record;
}
