import Stripe from "stripe";
import type { StripeSubscriptionSnapshot, StripeTestClient } from "./stripe.js";

function statusOf(status: Stripe.Subscription.Status): StripeSubscriptionSnapshot["status"] {
  switch (status) {
    case "active":
      return "active";
    case "canceled":
      return "canceled";
    case "incomplete":
      return "incomplete";
    case "past_due":
      return "past_due";
    default:
      return "unknown";
  }
}

function snapshotOf(subscription: Stripe.Subscription): StripeSubscriptionSnapshot {
  const item = subscription.items.data[0];
  if (!item || typeof item.price === "string" || item.price.unit_amount === null) {
    throw new Error("Stripe subscription did not include one expanded priced item.");
  }

  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
  const latestInvoiceId = typeof subscription.latest_invoice === "string"
    ? subscription.latest_invoice
    : subscription.latest_invoice?.id ?? null;

  return {
    subscriptionId: subscription.id,
    customerId,
    status: statusOf(subscription.status),
    priceId: item.price.id,
    unitAmount: item.price.unit_amount,
    quantity: item.quantity ?? 0,
    latestInvoiceId,
  };
}

/** Official Stripe SDK client. It is intentionally not imported by browser code. */
export function createStripeTestClient(secretKey: string): StripeTestClient {
  if (!/^sk_test_[A-Za-z0-9]+$/.test(secretKey)) {
    throw new Error("The official Stripe client requires a test-mode secret key.");
  }

  const stripe = new Stripe(secretKey);
  const expand = ["items.data.price", "latest_invoice"];

  return {
    retrieveSubscription: async (subscriptionId) => {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId, { expand });
      return snapshotOf(subscription);
    },
    updateSubscription: async (request) => {
      const current = await stripe.subscriptions.retrieve(request.subscriptionId, { expand });
      const item = current.items.data[0];
      if (!item) throw new Error("Stripe subscription has no subscription item to update.");

      const updated = await stripe.subscriptions.update(
        request.subscriptionId,
        {
          items: [{ id: item.id, price: request.priceId, quantity: request.quantity }],
          proration_behavior: request.prorationBehavior,
        },
        { idempotencyKey: request.idempotencyKey },
      );
      return snapshotOf(updated);
    },
  };
}
