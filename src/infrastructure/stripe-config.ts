import type { StripeAdapterConfig, StripeCustomerRecord } from "../integrations/stripe.js";

const requiredFields = new Set([
  "alias",
  "customerId",
  "subscriptionId",
  "grandfatheredPriceId",
  "grandfatheredUnitAmount",
  "quantity",
]);

function requireValue(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name];
  if (!value) throw new Error(`Missing required server configuration: ${name}`);
  return value;
}

function parseCustomer(value: unknown): StripeCustomerRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid Stripe customer configuration.");
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!requiredFields.has(key)) throw new Error(`Unknown Stripe customer field: ${key}`);
  }
  if (
    typeof record.alias !== "string" ||
    typeof record.customerId !== "string" ||
    typeof record.subscriptionId !== "string" ||
    typeof record.grandfatheredPriceId !== "string" ||
    record.grandfatheredUnitAmount !== 9900 ||
    typeof record.quantity !== "number" ||
    !Number.isInteger(record.quantity) ||
    record.quantity <= 0
  ) throw new Error("Invalid Stripe customer configuration values.");

  return {
    alias: record.alias,
    customerId: record.customerId,
    subscriptionId: record.subscriptionId,
    grandfatheredPriceId: record.grandfatheredPriceId,
    grandfatheredUnitAmount: 9900,
    quantity: record.quantity,
  };
}

export function loadStripeConfig(env: NodeJS.ProcessEnv): StripeAdapterConfig {
  const secretKey = requireValue(env, "STRIPE_SECRET_KEY");
  if (!/^sk_test_[A-Za-z0-9]+$/.test(secretKey)) throw new Error("Stripe configuration must use a test-mode secret key.");
  const rawCustomers = requireValue(env, "STRIPE_CUSTOMERS_JSON");
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawCustomers);
  } catch {
    throw new Error("STRIPE_CUSTOMERS_JSON must be valid JSON.");
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("STRIPE_CUSTOMERS_JSON must contain at least one customer.");

  const customers: Record<string, StripeCustomerRecord> = {};
  for (const value of parsed) {
    const record = parseCustomer(value);
    if (customers[record.alias]) throw new Error(`Duplicate Stripe customer alias: ${record.alias}`);
    customers[record.alias] = record;
  }
  return { secretKey, customers };
}
