/**
 * Team B: deterministic at-most-once execution contract.
 * The in-memory implementation is for unit/integration tests and local
 * development. Production wiring must provide the same contract through the
 * Amends SQLite action ledger.
 */

export type IdempotencyStatus = "CLAIMED" | "COMPLETED" | "FAILED";

export type IdempotencyRecord = {
  readonly key: string;
  readonly action: string;
  readonly status: IdempotencyStatus;
  readonly result?: string;
  readonly claimedAt: string;
  readonly completedAt?: string;
};

export type IdempotencyClaim =
  | { readonly kind: "NEW"; readonly record: IdempotencyRecord }
  | { readonly kind: "REPLAY"; readonly record: IdempotencyRecord }
  | { readonly kind: "CONFLICT"; readonly record: IdempotencyRecord };

export type IdempotencyStore = {
  readonly claim: (key: string, action: string, now: string) => IdempotencyClaim;
  readonly complete: (
    key: string,
    action: string,
    result: string,
    now: string,
  ) => IdempotencyRecord;
  readonly fail: (key: string, action: string, result: string, now: string) => IdempotencyRecord;
};

function validateKey(key: string): void {
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(key)) {
    throw new Error("Invalid idempotency key.");
  }
}

function validateAction(action: string): void {
  if (!/^[A-Z][A-Z0-9_]{2,80}$/.test(action)) {
    throw new Error("Invalid idempotency action.");
  }
}

/**
 * Test-safe implementation of the action ledger. A key can only be reused
 * for the same action; completed or failed results are returned as replays.
 */
export class InMemoryIdempotencyStore implements IdempotencyStore {
  private readonly records = new Map<string, IdempotencyRecord>();

  claim(key: string, action: string, now: string): IdempotencyClaim {
    validateKey(key);
    validateAction(action);
    const existing = this.records.get(key);
    if (existing) {
      return {
        kind: existing.action === action ? "REPLAY" : "CONFLICT",
        record: existing,
      };
    }

    const record: IdempotencyRecord = {
      key,
      action,
      status: "CLAIMED",
      claimedAt: now,
    };
    this.records.set(key, record);
    return { kind: "NEW", record };
  }

  complete(key: string, action: string, result: string, now: string): IdempotencyRecord {
    return this.finish(key, action, "COMPLETED", result, now);
  }

  fail(key: string, action: string, result: string, now: string): IdempotencyRecord {
    return this.finish(key, action, "FAILED", result, now);
  }

  private finish(
    key: string,
    action: string,
    status: "COMPLETED" | "FAILED",
    result: string,
    now: string,
  ): IdempotencyRecord {
    validateKey(key);
    validateAction(action);
    const existing = this.records.get(key);
    if (!existing || existing.action !== action || existing.status !== "CLAIMED") {
      throw new Error("Idempotency record cannot be finalized.");
    }

    const record: IdempotencyRecord = {
      ...existing,
      status,
      result,
      completedAt: now,
    };
    this.records.set(key, record);
    return record;
  }
}
