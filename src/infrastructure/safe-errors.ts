export type SafeError = {
  readonly code:
    | "INVALID_INPUT"
    | "PROVIDER_UNAVAILABLE"
    | "PRECONDITION_FAILED"
    | "RECOVERY_FAILED"
    | "INTERNAL_ERROR";
  readonly message: string;
};

/** Convert arbitrary provider/runtime errors into non-sensitive API errors. */
export function toSafeError(error: unknown): SafeError {
  if (error instanceof Error && error.message.includes("precondition")) {
    return { code: "PRECONDITION_FAILED", message: "Provider state changed; inspect again." };
  }
  if (error instanceof Error && /timeout|unavailable|network/i.test(error.message)) {
    return { code: "PROVIDER_UNAVAILABLE", message: "The provider is temporarily unavailable." };
  }
  if (error instanceof Error && /invalid|malformed|missing/i.test(error.message)) {
    return { code: "INVALID_INPUT", message: "The request is invalid." };
  }
  return { code: "INTERNAL_ERROR", message: "The operation could not be completed." };
}
