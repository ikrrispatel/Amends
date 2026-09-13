export type CompensationActionResult = {
  readonly action: string;
  readonly status: "COMMITTED" | "ALREADY_COMMITTED" | "FAILED" | "IRREVERSIBLE";
};

export type RecoverySummary = {
  readonly status: "RECOVERED" | "PARTIAL" | "FAILED";
  readonly actions: readonly CompensationActionResult[];
};

export function summarizeRecovery(actions: readonly CompensationActionResult[]): RecoverySummary {
  if (actions.length === 0 || actions.some((action) => action.status === "FAILED")) {
    return { status: "FAILED", actions };
  }
  if (actions.some((action) => action.status === "IRREVERSIBLE")) {
    return { status: "PARTIAL", actions };
  }
  return { status: "RECOVERED", actions };
}
