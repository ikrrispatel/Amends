/**
 * Adapted from ChronoMCP's deterministic compensation implementation.
 * Upstream: https://github.com/chronomcp/chronomcp
 * Pinned upstream commit: f8880665c4274aa4b6a798805a20ea55e9174866
 * See LICENSES/CHRONOMCP_LICENSE. Amends adds the allowlisted action and
 * business-state verification layers around this boundary.
 */

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type CompensationMeta = {
  readonly reversibility: "readonly" | "compensable" | "irreversible";
  readonly compensation?: {
    readonly toolName: string;
    readonly parameterMapping: Readonly<Record<string, string>>;
    readonly timeoutMs?: number;
    readonly maxRetries?: number;
  };
  readonly notes?: string;
};

export type ExecutedStep = {
  readonly toolName: string;
  readonly input: Record<string, JsonValue>;
  readonly output?: JsonValue;
  readonly compensate?: CompensationMeta;
};

export type RollbackReportItem = {
  readonly toolName: string;
  readonly status:
    | "compensated"
    | "compensation_failed"
    | "irreversible"
    | "no_compensation";
  readonly detail?: string;
};

export type InvokeCompensation = (
  toolName: string,
  args: Record<string, JsonValue>,
  timeoutMs: number,
) => Promise<{ readonly ok: boolean; readonly detail?: string }>;

function resolveMapping(
  path: string,
  step: ExecutedStep,
): JsonValue | undefined {
  const match = /^\$\.(input|output)((?:\.[A-Za-z_][A-Za-z0-9_]*)+)$/.exec(path);
  if (!match) return undefined;

  const root = match[1] === "input" ? step.input : step.output;
  let current: JsonValue | undefined = root;
  for (const segment of match[2]!.split(".").filter(Boolean)) {
    if (current && typeof current === "object" && !Array.isArray(current)) {
      current = (current as Record<string, JsonValue>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function compensationArgs(
  step: ExecutedStep,
):
  | { readonly kind: "compensate"; readonly toolName: string; readonly args: Record<string, JsonValue> }
  | { readonly kind: "irreversible" }
  | { readonly kind: "none" } {
  const metadata = step.compensate;
  if (!metadata) return { kind: "none" };
  if (metadata.reversibility === "irreversible") return { kind: "irreversible" };
  if (metadata.reversibility !== "compensable" || !metadata.compensation) {
    return { kind: "none" };
  }

  const args: Record<string, JsonValue> = {};
  for (const [name, reference] of Object.entries(
    metadata.compensation.parameterMapping,
  )) {
    const value = resolveMapping(reference, step);
    if (value !== undefined) args[name] = value;
  }
  return { kind: "compensate", toolName: metadata.compensation.toolName, args };
}

/** Execute compensation in reverse order and return an honest report. */
export async function runCompensation(
  stack: ExecutedStep[],
  invoke: InvokeCompensation,
): Promise<RollbackReportItem[]> {
  const report: RollbackReportItem[] = [];

  while (stack.length > 0) {
    const step = stack.pop()!;
    const plan = compensationArgs(step);

    if (plan.kind === "irreversible") {
      report.push({
        toolName: step.toolName,
        status: "irreversible",
        ...(step.compensate?.notes ? { detail: step.compensate.notes } : {}),
      });
      continue;
    }
    if (plan.kind === "none") {
      report.push({ toolName: step.toolName, status: "no_compensation" });
      continue;
    }

    const metadata = step.compensate?.compensation;
    const timeoutMs = metadata?.timeoutMs ?? 5000;
    const maxRetries = metadata?.maxRetries ?? 3;
    let lastDetail: string | undefined;
    let compensated = false;

    for (let attempt = 0; attempt <= maxRetries && !compensated; attempt += 1) {
      const result = await invoke(plan.toolName, plan.args, timeoutMs);
      compensated = result.ok;
      lastDetail = result.detail;
    }

    report.push({
      toolName: step.toolName,
      status: compensated ? "compensated" : "compensation_failed",
      ...(compensated
        ? { detail: `via ${plan.toolName}` }
        : lastDetail
          ? { detail: lastDetail }
          : {}),
    });
  }

  return report;
}
