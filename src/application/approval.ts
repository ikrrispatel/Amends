export type ApprovalDecision =
  | { readonly ok: true; readonly runCode: string }
  | { readonly ok: false; readonly reason: "INVALID_COMMAND" | "WRONG_ACTOR" | "EXPIRED" | "WRONG_RUN" };

export function validateApproval(
  command: string,
  actor: string,
  configuredActor: string,
  runCode: string,
  expiresAt: string,
  now: string,
): ApprovalDecision {
  if (actor !== configuredActor) return { ok: false, reason: "WRONG_ACTOR" };
  if (new Date(now).getTime() >= new Date(expiresAt).getTime()) return { ok: false, reason: "EXPIRED" };
  const expected = `APPROVE ${runCode}`;
  if (command !== expected) return { ok: false, reason: "INVALID_COMMAND" };
  return { ok: true, runCode };
}
