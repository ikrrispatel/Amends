/**
 * Database-shaped action ledger for public deployment. The in-memory version
 * is deterministic test infrastructure; a SQLite/Postgres implementation can
 * satisfy the same interface without changing the Team B safety rules.
 */

export type ActionStatus = "CLAIMED" | "COMPLETED" | "FAILED";

export type ActionRecord = {
  readonly id: string;
  readonly runId: string;
  readonly actionType: string;
  readonly idempotencyKey: string;
  readonly preconditionsJson: string;
  readonly status: ActionStatus;
  readonly resultJson?: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ActionClaim =
  | { readonly kind: "NEW"; readonly record: ActionRecord }
  | { readonly kind: "REPLAY"; readonly record: ActionRecord }
  | { readonly kind: "CONFLICT"; readonly record: ActionRecord };

export type ActionLedger = {
  readonly claim: (
    record: Omit<ActionRecord, "status" | "updatedAt"> & { readonly status?: never },
  ) => ActionClaim;
  readonly finish: (
    idempotencyKey: string,
    actionType: string,
    status: "COMPLETED" | "FAILED",
    resultJson: string,
    updatedAt: string,
  ) => ActionRecord;
};

function validateId(value: string, name: string): void {
  if (!/^[A-Za-z0-9._:-]{8,128}$/.test(value)) throw new Error(`Invalid ${name}.`);
}

function validateJson(value: string, name: string): void {
  try {
    JSON.parse(value);
  } catch {
    throw new Error(`Invalid ${name} JSON.`);
  }
}

export class InMemoryActionLedger implements ActionLedger {
  private readonly records = new Map<string, ActionRecord>();

  claim(input: Omit<ActionRecord, "status" | "updatedAt"> & { readonly status?: never }): ActionClaim {
    validateId(input.id, "action ID");
    validateId(input.runId, "run ID");
    validateId(input.idempotencyKey, "idempotency key");
    validateJson(input.preconditionsJson, "preconditions");
    const existing = this.records.get(input.idempotencyKey);
    if (existing) {
      return {
        kind: existing.actionType === input.actionType ? "REPLAY" : "CONFLICT",
        record: existing,
      };
    }

    const record: ActionRecord = {
      ...input,
      status: "CLAIMED",
      updatedAt: input.createdAt,
    };
    this.records.set(input.idempotencyKey, record);
    return { kind: "NEW", record };
  }

  finish(
    idempotencyKey: string,
    actionType: string,
    status: "COMPLETED" | "FAILED",
    resultJson: string,
    updatedAt: string,
  ): ActionRecord {
    validateJson(resultJson, "result");
    const existing = this.records.get(idempotencyKey);
    if (!existing || existing.actionType !== actionType || existing.status !== "CLAIMED") {
      throw new Error("Action cannot be finalized.");
    }
    const record: ActionRecord = { ...existing, status, resultJson, updatedAt };
    this.records.set(idempotencyKey, record);
    return record;
  }
}
