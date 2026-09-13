import { createHash } from "node:crypto";

export type AuditMetadata = Readonly<Record<string, string | number | boolean | null>>;

export type AuditEvent = {
  readonly sequence: number;
  readonly runId: string;
  readonly eventType: string;
  readonly metadata: AuditMetadata;
  readonly createdAt: string;
  readonly previousHash: string;
  readonly hash: string;
};

function canonical(value: AuditMetadata): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))));
}

function hashEvent(input: Omit<AuditEvent, "hash">): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

/** Append-only audit ledger with a tamper-evident hash chain. */
export class AuditLedger {
  private readonly events: AuditEvent[] = [];

  append(runId: string, eventType: string, metadata: AuditMetadata, createdAt: string): AuditEvent {
    if (!/^[A-Za-z0-9._:-]{8,128}$/.test(runId)) throw new Error("Invalid audit run ID.");
    if (!/^[A-Z][A-Z0-9_]{2,80}$/.test(eventType)) throw new Error("Invalid audit event type.");
    const sequence = this.events.length + 1;
    const previousHash = this.events.at(-1)?.hash ?? "GENESIS";
    const input = { sequence, runId, eventType, metadata: JSON.parse(canonical(metadata)) as AuditMetadata, createdAt, previousHash };
    const event: AuditEvent = { ...input, hash: hashEvent(input) };
    this.events.push(event);
    return event;
  }

  list(): readonly AuditEvent[] {
    return this.events.map((event) => ({ ...event, metadata: { ...event.metadata } }));
  }

  verify(): boolean {
    let previousHash = "GENESIS";
    for (let index = 0; index < this.events.length; index += 1) {
      const event = this.events[index]!;
      const input = { sequence: index + 1, runId: event.runId, eventType: event.eventType, metadata: event.metadata, createdAt: event.createdAt, previousHash };
      if (event.previousHash !== previousHash || event.hash !== hashEvent(input)) return false;
      previousHash = event.hash;
    }
    return true;
  }
}
