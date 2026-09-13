import { validateApproval } from "./approval.js";
import { summarizeRecovery, type RecoverySummary } from "./recovery-result.js";

export type RecoveryApiRun = {
  readonly runId: string;
  readonly runCode: string;
  readonly status: "CREATED" | "APPROVAL_PENDING" | "APPROVED" | "RECOVERED" | "PARTIAL" | "FAILED";
  readonly expiresAt: string;
  readonly approvalActor: string;
};

/** Sanitized application API façade for the eventual HTTP routes. */
export class RecoveryApi {
  private readonly runs = new Map<string, RecoveryApiRun>();

  create(runId: string, runCode: string, expiresAt: string, approvalActor: string): RecoveryApiRun {
    const run: RecoveryApiRun = { runId, runCode, status: "CREATED", expiresAt, approvalActor };
    this.runs.set(runId, run);
    return run;
  }

  requestApproval(runId: string, now: string): RecoveryApiRun {
    const run = this.require(runId);
    if (new Date(now).getTime() >= new Date(run.expiresAt).getTime()) throw new Error("Approval plan expired.");
    const next = { ...run, status: "APPROVAL_PENDING" as const };
    this.runs.set(runId, next);
    return next;
  }

  approve(runId: string, command: string, actor: string, now: string): RecoveryApiRun {
    const run = this.require(runId);
    const decision = validateApproval(command, actor, run.approvalActor, run.runCode, run.expiresAt, now);
    if (!decision.ok) throw new Error(`Approval rejected: ${decision.reason}`);
    const next = { ...run, status: "APPROVED" as const };
    this.runs.set(runId, next);
    return next;
  }

  finish(runId: string, summary: RecoverySummary): RecoveryApiRun {
    const run = this.require(runId);
    const status: RecoveryApiRun["status"] = summary.status === "RECOVERED" ? "RECOVERED" : summary.status;
    const next = { ...run, status };
    this.runs.set(runId, next);
    return next;
  }

  summarize(actions: Parameters<typeof summarizeRecovery>[0]): RecoverySummary {
    return summarizeRecovery(actions);
  }

  private require(runId: string): RecoveryApiRun {
    const run = this.runs.get(runId);
    if (!run) throw new Error("Run not found.");
    return run;
  }
}
