import { z } from 'zod';

export const RunStateSchema = z.enum([
  'CREATED',
  'INSPECTING',
  'MISMATCH_FOUND',
  'APPROVAL_PENDING',
  'APPROVED',
  'RECOVERING',
  'VERIFYING',
  'VERIFIED',
  'NO_MISMATCH',
  'MANUAL_REVIEW',
  'INSPECTION_FAILED',
  'APPROVAL_DENIED',
  'PLAN_EXPIRED',
  'RECOVERY_PARTIAL',
  'VERIFICATION_FAILED',
]);

export type RunState = z.infer<typeof RunStateSchema>;

export const VALID_RUN_STATE_TRANSITIONS: Record<RunState, readonly RunState[]> = {
  CREATED: ['INSPECTING', 'MANUAL_REVIEW'],
  INSPECTING: ['MISMATCH_FOUND', 'NO_MISMATCH', 'INSPECTION_FAILED', 'MANUAL_REVIEW'],
  MISMATCH_FOUND: ['APPROVAL_PENDING', 'MANUAL_REVIEW'],
  APPROVAL_PENDING: ['APPROVED', 'APPROVAL_DENIED', 'PLAN_EXPIRED', 'MANUAL_REVIEW'],
  APPROVED: ['RECOVERING', 'MANUAL_REVIEW'],
  RECOVERING: ['VERIFYING', 'RECOVERY_PARTIAL', 'MANUAL_REVIEW'],
  VERIFYING: ['VERIFIED', 'VERIFICATION_FAILED', 'MANUAL_REVIEW'],
  VERIFIED: [],
  NO_MISMATCH: [],
  MANUAL_REVIEW: [],
  INSPECTION_FAILED: [],
  APPROVAL_DENIED: [],
  PLAN_EXPIRED: [],
  RECOVERY_PARTIAL: [],
  VERIFICATION_FAILED: [],
} as const;

export function isValidRunTransition(from: RunState, to: RunState): boolean {
  return VALID_RUN_STATE_TRANSITIONS[from].includes(to);
}

export function assertValidRunTransition(from: RunState, to: RunState): void {
  if (!isValidRunTransition(from, to)) {
    throw new Error(
      `Illegal run-state transition: ${from} -> ${to}. Allowed transitions: ${VALID_RUN_STATE_TRANSITIONS[from].join(', ') || 'none'}`,
    );
  }
}
