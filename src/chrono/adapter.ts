import { CHRONOMCP_ATTRIBUTION } from "./attribution.js";

/**
 * Only these approved mutation kinds may cross the ChronoMCP boundary.
 * Provider identifiers must already have been resolved by trusted server-side
 * configuration before an adapter receives them.
 */
export type ChronoMutation =
  | {
      readonly kind: "RESTORE_STRIPE_GRANDFATHERED_PRICE";
      readonly customerId: string;
      readonly subscriptionId: string;
      readonly priceId: string;
      readonly quantity: 87;
      readonly unitAmount: 9900;
      readonly idempotencyKey: string;
    }
  | {
      readonly kind: "RESTORE_NOTION_PRICING_POLICY";
      readonly pageId: string;
      readonly scope: "new_customers_only";
      readonly existingAmount: 9900;
      readonly newAmount: 12900;
      readonly idempotencyKey: string;
    };

export type ChronoMutationResult = {
  readonly ok: boolean;
  readonly detailCode:
    | "COMMITTED"
    | "ALREADY_COMMITTED"
    | "REJECTED"
    | "FAILED";
};

export type ChronoMutationExecutor = (
  mutation: ChronoMutation,
) => Promise<ChronoMutationResult>;

/**
 * Narrow Amends-owned seam for the retained ChronoMCP boundary. The actual
 * provider adapters remain responsible for test-mode and precondition checks.
 */
export function createChronoBoundary(
  execute: ChronoMutationExecutor,
): ChronoMutationExecutor {
  return async (mutation) => {
    if (!CHRONOMCP_ATTRIBUTION.pinnedCommit) {
      return { ok: false, detailCode: "REJECTED" };
    }
    return execute(mutation);
  };
}
