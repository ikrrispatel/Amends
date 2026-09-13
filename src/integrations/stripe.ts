/** Team B: configurable, test-mode-only Stripe adapter. */

export type StripeSubscriptionSnapshot = {
  readonly subscriptionId: string;
  readonly customerId: string;
  readonly status: "active" | "canceled" | "incomplete" | "past_due" | "unknown";
  readonly priceId: string;
  readonly unitAmount: number;
  readonly quantity: number;
  readonly latestInvoiceId: string | null;
};

export type StripeCustomerRecord = {
  readonly alias: string;
  readonly customerId: string;
  readonly subscriptionId: string;
  readonly grandfatheredPriceId: string;
  readonly grandfatheredUnitAmount: 9900;
  readonly quantity: number;
};

export type StripeRestoreResult =
  | { readonly status: "COMMITTED"; readonly snapshot: StripeSubscriptionSnapshot }
  | { readonly status: "ALREADY_COMMITTED"; readonly snapshot: StripeSubscriptionSnapshot };

export type StripeTestClient = {
  readonly retrieveSubscription: (subscriptionId: string) => Promise<StripeSubscriptionSnapshot>;
  readonly updateSubscription: (request: {
    readonly subscriptionId: string;
    readonly priceId: string;
    readonly quantity: number;
    readonly prorationBehavior: "none";
    readonly idempotencyKey: string;
  }) => Promise<StripeSubscriptionSnapshot>;
};

export type StripeAdapterConfig = {
  readonly secretKey: string;
  readonly customers: Readonly<Record<string, StripeCustomerRecord>>;
};

export type StripeAdapterErrorCode =
  | "LIVE_KEY_REJECTED"
  | "INVALID_ALIAS"
  | "INVALID_CUSTOMER_ID"
  | "INVALID_SUBSCRIPTION_ID"
  | "INVALID_PRICE_ID"
  | "PRECONDITION_FAILED"
  | "PRORATION_DETECTED"
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
    throw new StripeAdapterError("LIVE_KEY_REJECTED", "Stripe mutations require a test-mode secret key.");
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
    throw new StripeAdapterError("INVALID_IDEMPOTENCY_KEY", "Idempotency keys must be stable, non-empty, and bounded.");
  }
}

export function verifyNoProration(
  before: StripeSubscriptionSnapshot,
  after: StripeSubscriptionSnapshot,
): void {
  if (
    before.subscriptionId !== after.subscriptionId ||
    before.latestInvoiceId !== after.latestInvoiceId
  ) {
    throw new StripeAdapterError(
      "PRORATION_DETECTED",
      "Recovery changed the invoice fingerprint; no-proration verification failed.",
    );
  }
}

export class StripeAdapter {
  private readonly config: StripeAdapterConfig;
  private readonly client: StripeTestClient;

  constructor(config: StripeAdapterConfig, client: StripeTestClient) {
    requireTestMode(config.secretKey);
    const records = Object.values(config.customers);
    if (records.length === 0) throw new StripeAdapterError("INVALID_ALIAS", "At least one customer is required.");
    for (const record of records) {
      requireStripeId(record.customerId, "cus_", "INVALID_CUSTOMER_ID");
      requireStripeId(record.subscriptionId, "sub_", "INVALID_SUBSCRIPTION_ID");
      requireStripeId(record.grandfatheredPriceId, "price_", "INVALID_PRICE_ID");
    }
    this.config = config;
    this.client = client;
  }

  async readCustomer(alias: string): Promise<StripeSubscriptionSnapshot> {
    const record = this.requireCustomer(alias);
    const snapshot = await this.client.retrieveSubscription(record.subscriptionId);
    this.assertTrustedSnapshot(snapshot, record);
    return snapshot;
  }

  async restoreGrandfatheredPrice(
    alias: string,
    expected: StripeSubscriptionSnapshot,
    idempotencyKey: string,
  ): Promise<StripeRestoreResult> {
    requireIdempotencyKey(idempotencyKey);
    const record = this.requireCustomer(alias);
    const current = await this.readCustomer(alias);
    this.assertPrecondition(current, expected);

    if (current.priceId === record.grandfatheredPriceId && current.unitAmount === record.grandfatheredUnitAmount && current.quantity === record.quantity) {
      return { status: "ALREADY_COMMITTED", snapshot: current };
    }

    const restored = await this.client.updateSubscription({
      subscriptionId: record.subscriptionId,
      priceId: record.grandfatheredPriceId,
      quantity: record.quantity,
      prorationBehavior: "none",
      idempotencyKey,
    });
    this.assertTrustedSnapshot(restored, record);
    verifyNoProration(current, restored);
    return { status: "COMMITTED", snapshot: restored };
  }

  private requireCustomer(alias: string): StripeCustomerRecord {
    const record = this.config.customers[alias];
    if (!record || record.alias !== alias) throw new StripeAdapterError("INVALID_ALIAS", "Customer alias is not allowlisted.");
    return record;
  }

  private assertTrustedSnapshot(snapshot: StripeSubscriptionSnapshot, record: StripeCustomerRecord): void {
    if (snapshot.customerId !== record.customerId || snapshot.subscriptionId !== record.subscriptionId) {
      throw new StripeAdapterError("PRECONDITION_FAILED", "Stripe returned a resource outside the trusted configuration.");
    }
  }

  private assertPrecondition(current: StripeSubscriptionSnapshot, expected: StripeSubscriptionSnapshot): void {
    if (current.customerId !== expected.customerId || current.subscriptionId !== expected.subscriptionId || current.status !== expected.status || current.priceId !== expected.priceId || current.unitAmount !== expected.unitAmount || current.quantity !== expected.quantity || current.latestInvoiceId !== expected.latestInvoiceId) {
      throw new StripeAdapterError("PRECONDITION_FAILED", "Stripe state changed after inspection; recovery must be re-planned.");
    }
  }
}
