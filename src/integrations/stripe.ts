/** Team B: test-mode-only Stripe provider adapter. */

import {
  StripeExecutionContextSchema,
  StripeInspectionInputSchema,
  StripeProviderStateSchema,
  type StripeProviderAdapter,
  type StripeProviderState,
  type StripeSanitizedResult,
} from "../providers/contracts/stripe.js";

export type StripeSubscriptionSnapshot = {
  readonly subscriptionItemId: string;
  readonly subscriptionId: string;
  readonly customerId: string;
  readonly status: "active" | "canceled" | "incomplete" | "past_due" | "unknown";
  readonly priceId: string;
  readonly unitAmount: number;
  readonly quantity: number;
  readonly latestInvoiceId: string | null;
};

export type StripeCustomerRecord = {
  readonly alias: "northstar";
  readonly customerId: string;
  readonly subscriptionId: string;
  readonly subscriptionItemId: string;
  readonly grandfatheredPriceId: string;
  readonly newPriceId: string;
  readonly grandfatheredUnitAmount: 9900;
  readonly quantity: 87;
};

export type StripeProviderConfig = {
  readonly secretKey: string;
  readonly customers: Readonly<Record<string, StripeCustomerRecord>>;
};

export type StripeTestClient = {
  readonly retrieveSubscription: (record: StripeCustomerRecord) => Promise<StripeSubscriptionSnapshot>;
  readonly updateSubscription: (request: {
    readonly record: StripeCustomerRecord;
    readonly priceId: string;
    readonly quantity: 87;
    readonly prorationBehavior: "none";
    readonly idempotencyKey: string;
  }) => Promise<StripeSubscriptionSnapshot>;
};

export type StripeAdapterErrorCode =
  | "LIVE_KEY_REJECTED"
  | "INVALID_ALIAS"
  | "INVALID_ID"
  | "PRECONDITION_FAILED"
  | "PRORATION_DETECTED"
  | "INVALID_IDEMPOTENCY_KEY"
  | "INVALID_INPUT";

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

function requireId(value: string, prefix: string): void {
  if (!new RegExp(`^${prefix}[A-Za-z0-9_]+$`).test(value)) {
    throw new StripeAdapterError("INVALID_ID", "A configured Stripe resource ID is invalid.");
  }
}

function requireIdempotencyKey(value: string): void {
  if (!/^[A-Za-z0-9._:-]{16,128}$/.test(value)) {
    throw new StripeAdapterError("INVALID_IDEMPOTENCY_KEY", "The idempotency key is invalid.");
  }
}

function invoiceFingerprint(snapshot: StripeSubscriptionSnapshot): string | null {
  return snapshot.latestInvoiceId;
}

export function verifyNoProration(before: StripeSubscriptionSnapshot, after: StripeSubscriptionSnapshot): void {
  if (before.subscriptionId !== after.subscriptionId || invoiceFingerprint(before) !== invoiceFingerprint(after)) {
    throw new StripeAdapterError("PRORATION_DETECTED", "Stripe recovery changed the invoice fingerprint.");
  }
}

function toProviderState(record: StripeCustomerRecord, snapshot: StripeSubscriptionSnapshot): StripeProviderState {
  if (snapshot.customerId !== record.customerId || snapshot.subscriptionId !== record.subscriptionId || snapshot.subscriptionItemId !== record.subscriptionItemId) {
    throw new StripeAdapterError("PRECONDITION_FAILED", "Stripe returned an untrusted resource.");
  }
  return StripeProviderStateSchema.parse({
    provider: "Stripe",
    customerAlias: "northstar",
    accountMode: "TEST",
    subscriptionItemId: snapshot.subscriptionItemId,
    grandfatheredPriceId: record.grandfatheredPriceId,
    currentPriceId: snapshot.priceId,
    status: snapshot.status === "active" ? "ACTIVE" : "INACTIVE",
    unitAmountCents: snapshot.unitAmount,
    quantity: snapshot.quantity,
    invoiceFingerprint: invoiceFingerprint(snapshot),
    readAt: new Date().toISOString(),
  });
}

export class StripeAdapter implements StripeProviderAdapter {
  private readonly config: StripeProviderConfig;
  private readonly client: StripeTestClient;
  private readonly inspected = new Map<string, StripeSubscriptionSnapshot>();

  constructor(config: StripeProviderConfig, client: StripeTestClient) {
    requireTestMode(config.secretKey);
    const records = Object.values(config.customers);
    if (records.length === 0) throw new StripeAdapterError("INVALID_ALIAS", "No trusted Stripe customer is configured.");
    for (const record of records) {
      requireId(record.customerId, "cus_");
      requireId(record.subscriptionId, "sub_");
      requireId(record.subscriptionItemId, "si_");
      requireId(record.grandfatheredPriceId, "price_");
      requireId(record.newPriceId, "price_");
    }
    this.config = config;
    this.client = client;
  }

  async inspect(input: Parameters<StripeProviderAdapter["inspect"]>[0]): Promise<StripeProviderState> {
    const parsed = StripeInspectionInputSchema.safeParse(input);
    if (!parsed.success || parsed.data.accountMode !== "TEST") throw new StripeAdapterError("INVALID_INPUT", "Stripe inspection requires TEST mode.");
    const record = this.requireCustomer(parsed.data.customerAlias);
    const snapshot = await this.client.retrieveSubscription(record);
    this.inspected.set(record.alias, snapshot);
    return toProviderState(record, snapshot);
  }

  async verifyReread(input: Parameters<StripeProviderAdapter["verifyReread"]>[0]): Promise<StripeProviderState> {
    return this.inspect(input);
  }

  async executeAllowlistedRecovery(context: Parameters<StripeProviderAdapter["executeAllowlistedRecovery"]>[0]): Promise<StripeSanitizedResult> {
    const parsed = StripeExecutionContextSchema.safeParse(context);
    if (!parsed.success || parsed.data.accountMode !== "TEST") throw new StripeAdapterError("INVALID_INPUT", "Stripe recovery requires TEST mode.");
    requireIdempotencyKey(parsed.data.idempotencyKey);
    const record = this.requireCustomer(parsed.data.customerAlias);
    const expected = this.inspected.get(record.alias);
    if (!expected) throw new StripeAdapterError("PRECONDITION_FAILED", "Recovery requires a prior inspection.");
    const current = await this.client.retrieveSubscription(record);
    if (JSON.stringify(current) !== JSON.stringify(expected)) throw new StripeAdapterError("PRECONDITION_FAILED", "Stripe state changed after inspection.");
    if (current.priceId === record.grandfatheredPriceId && current.unitAmount === 9900 && current.quantity === 87) {
      return this.sanitizedResult("SKIPPED", record.subscriptionItemId, true);
    }
    const updated = await this.client.updateSubscription({ record, priceId: record.grandfatheredPriceId, quantity: 87, prorationBehavior: "none", idempotencyKey: parsed.data.idempotencyKey });
    const reread = await this.client.retrieveSubscription(record);
    verifyNoProration(current, reread);
    if (reread.priceId !== record.grandfatheredPriceId || reread.unitAmount !== 9900 || reread.quantity !== 87) throw new StripeAdapterError("PRECONDITION_FAILED", "Stripe recovery did not reach the trusted target state.");
    if (updated.subscriptionItemId !== reread.subscriptionItemId) throw new StripeAdapterError("PRECONDITION_FAILED", "Stripe returned an unexpected subscription item.");
    return this.sanitizedResult("SUCCEEDED", record.subscriptionItemId, true);
  }

  private sanitizedResult(status: StripeSanitizedResult["status"], resultId: string, verified: boolean): StripeSanitizedResult {
    return { provider: "Stripe", actionType: "RESTORE_STRIPE_GRANDFATHERED_PRICE", status, resultId, verified, readAt: new Date().toISOString() };
  }

  private requireCustomer(alias: string): StripeCustomerRecord {
    const record = this.config.customers[alias];
    if (!record || record.alias !== "northstar") throw new StripeAdapterError("INVALID_ALIAS", "Customer alias is not allowlisted.");
    return record;
  }
}

/** Structural boundary for the official Stripe SDK, kept injectable for tests. */
export type OfficialStripeSdk = {
  readonly subscriptionItems: { readonly retrieve: (id: string) => Promise<{ readonly id: string; readonly subscription: string; readonly customer: string; readonly quantity: number; readonly price: { readonly id: string; readonly unit_amount: number | null } }> };
  readonly subscriptions: {
    readonly retrieve: (id: string) => Promise<{ readonly id: string; readonly status: string; readonly latest_invoice: string | { readonly id: string } | null }>;
    readonly update: (id: string, params: { readonly items: readonly [{ readonly id: string; readonly price: string; readonly quantity: 87 }]; readonly proration_behavior: "none" }, options: { readonly idempotencyKey: string }) => Promise<unknown>;
  };
};

export function createOfficialStripeClient(stripe: OfficialStripeSdk): StripeTestClient {
  const retrieveSubscription = async (record: StripeCustomerRecord): Promise<StripeSubscriptionSnapshot> => {
    const item = await stripe.subscriptionItems.retrieve(record.subscriptionItemId);
    const subscription = await stripe.subscriptions.retrieve(record.subscriptionId);
    return {
      subscriptionItemId: item.id,
      subscriptionId: subscription.id,
      customerId: item.customer,
      status: ["active", "canceled", "incomplete", "past_due"].includes(subscription.status) ? subscription.status as StripeSubscriptionSnapshot["status"] : "unknown",
      priceId: item.price.id,
      unitAmount: item.price.unit_amount ?? 0,
      quantity: item.quantity,
      latestInvoiceId: typeof subscription.latest_invoice === "string" ? subscription.latest_invoice : subscription.latest_invoice?.id ?? null,
    };
  };
  return {
    retrieveSubscription,
    updateSubscription: async ({ record, priceId, quantity, prorationBehavior, idempotencyKey }) => {
      await stripe.subscriptions.update(record.subscriptionId, { items: [{ id: record.subscriptionItemId, price: priceId, quantity }], proration_behavior: prorationBehavior }, { idempotencyKey });
      return retrieveSubscription(record);
    },
  };
}
