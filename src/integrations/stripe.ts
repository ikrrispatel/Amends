/**
 * Team B: narrow Stripe test-mode adapter for the Northstar demo resource.
 * Provider identifiers are trusted configuration; callers cannot supply them
 * as model-generated action parameters.
 */

export type StripeSubscriptionSnapshot = {
  readonly subscriptionId: string;
  readonly customerId: string;
  readonly status: "active" | "canceled" | "incomplete" | "past_due" | "unknown";
  readonly priceId: string;
  readonly unitAmount: number;
  readonly quantity: number;
  readonly latestInvoiceId: string | null;
};

export type StripeRestoreResult =
  | { readonly status: "COMMITTED"; readonly snapshot: StripeSubscriptionSnapshot }
  | { readonly status: "ALREADY_COMMITTED"; readonly snapshot: StripeSubscriptionSnapshot };

export type StripeTestClient = {
  readonly retrieveSubscription: (
    subscriptionId: string,
  ) => Promise<StripeSubscriptionSnapshot>;
  readonly updateSubscription: (request: {
    readonly subscriptionId: string;
    readonly priceId: string;
    readonly quantity: 87;
    readonly prorationBehavior: "none";
    readonly idempotencyKey: string;
  }) => Promise<StripeSubscriptionSnapshot>;
};

export type StripeAdapterConfig = {
  readonly secretKey: string;
  readonly northstarCustomerId: string;
  readonly northstarSubscriptionId: string;
  readonly grandfatheredPriceId: string;
};

export type StripeAdapterErrorCode =
  | "LIVE_KEY_REJECTED"
  | "INVALID_CUSTOMER_ID"
  | "INVALID_SUBSCRIPTION_ID"
  | "INVALID_PRICE_ID"
  | "PRECONDITION_FAILED"
  | "INVALID_IDEMPOTENCY_KEY";

export class StripeAdapterError extends Error {
  readonly code: StripeAdapterErrorCode;

  constructor(code: StripeAdapterErrorCode, message: string) {
    super(message);
    this.name = "StripeAdapterError";
    this.code = code;
  }
}

function requireTestMode(secretKey: string): void {
  if (!/^sk_test_[A-Za-z0-9]+$/.test(secretKey)) {
    throw new StripeAdapterError(
      "LIVE_KEY_REJECTED",
      "Stripe mutations require a test-mode secret key.",
    );
  }
}

function requireStripeId(
  value: string,
  prefix: "cus_" | "sub_" | "price_",
  code: "INVALID_CUSTOMER_ID" | "INVALID_SUBSCRIPTION_ID" | "INVALID_PRICE_ID",
): void {
  if (!new RegExp(`^${prefix}[A-Za-z0-9_]+$`).test(value)) {
    throw new StripeAdapterError(code, `Invalid configured Stripe ${prefix.slice(0, -1)} ID.`);
  }
}

function requireIdempotencyKey(value: string): void {
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(value)) {
    throw new StripeAdapterError(
      "INVALID_IDEMPOTENCY_KEY",
      "Idempotency keys must be stable, non-empty, and bounded.",
    );
  }
}

export class StripeAdapter {
  private readonly config: StripeAdapterConfig;
  private readonly client: StripeTestClient;

  constructor(config: StripeAdapterConfig, client: StripeTestClient) {
    requireTestMode(config.secretKey);
    requireStripeId(config.northstarCustomerId, "cus_", "INVALID_CUSTOMER_ID");
    requireStripeId(config.northstarSubscriptionId, "sub_", "INVALID_SUBSCRIPTION_ID");
    requireStripeId(config.grandfatheredPriceId, "price_", "INVALID_PRICE_ID");
    this.config = config;
    this.client = client;
  }

  async readNorthstar(): Promise<StripeSubscriptionSnapshot> {
    const snapshot = await this.client.retrieveSubscription(
      this.config.northstarSubscriptionId,
    );
    this.assertTrustedSnapshot(snapshot);
    return snapshot;
  }

  async restoreGrandfatheredPrice(
    expected: StripeSubscriptionSnapshot,
    idempotencyKey: string,
  ): Promise<StripeRestoreResult> {
    requireIdempotencyKey(idempotencyKey);
    const current = await this.readNorthstar();
    this.assertPrecondition(current, expected);

    if (
      current.priceId === this.config.grandfatheredPriceId &&
      current.unitAmount === 9900 &&
      current.quantity === 87
    ) {
      return { status: "ALREADY_COMMITTED", snapshot: current };
    }

    const restored = await this.client.updateSubscription({
      subscriptionId: this.config.northstarSubscriptionId,
      priceId: this.config.grandfatheredPriceId,
      quantity: 87,
      prorationBehavior: "none",
      idempotencyKey,
    });
    this.assertTrustedSnapshot(restored);
    return { status: "COMMITTED", snapshot: restored };
  }

  private assertTrustedSnapshot(snapshot: StripeSubscriptionSnapshot): void {
    if (
      snapshot.customerId !== this.config.northstarCustomerId ||
      snapshot.subscriptionId !== this.config.northstarSubscriptionId
    ) {
      throw new StripeAdapterError(
        "PRECONDITION_FAILED",
        "Stripe returned a resource outside the trusted Northstar configuration.",
      );
    }
  }

  private assertPrecondition(
    current: StripeSubscriptionSnapshot,
    expected: StripeSubscriptionSnapshot,
  ): void {
    if (
      current.customerId !== expected.customerId ||
      current.subscriptionId !== expected.subscriptionId ||
      current.status !== expected.status ||
      current.priceId !== expected.priceId ||
      current.unitAmount !== expected.unitAmount ||
      current.quantity !== expected.quantity ||
      current.latestInvoiceId !== expected.latestInvoiceId
    ) {
      throw new StripeAdapterError(
        "PRECONDITION_FAILED",
        "Stripe state changed after inspection; recovery must be re-planned.",
      );
    }
  }
}
