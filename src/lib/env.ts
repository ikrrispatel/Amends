import { z } from 'zod';

// Server-only environment validation.
// Import this module only from server-side code. Do NOT import from React components.

const AmendsEnvSchema = z.object({
  OPENAI_API_KEY: z.string().nonempty(),
  OPENAI_MODEL: z.string().nonempty(),
  STRIPE_SECRET_KEY: z.string().nonempty().refine((v) => !v.startsWith('live_'), {
    message: 'Stripe live keys are not allowed; use test keys only',
  }),
  STRIPE_NORTHSTAR_SUBSCRIPTION_ITEM_ID: z.string().nonempty(),
  STRIPE_GRANDFATHERED_PRICE_ID: z.string().nonempty(),
  STRIPE_NEW_PRICE_ID: z.string().nonempty(),
  NOTION_TOKEN: z.string().nonempty(),
  NOTION_PAGE_ID: z.string().nonempty(),
  SLACK_BOT_TOKEN: z.string().nonempty(),
  SLACK_CHANNEL_ID: z.string().nonempty(),
  SLACK_APPROVER_USER_ID: z.string().nonempty(),
});

export type AmendsEnv = z.infer<typeof AmendsEnvSchema>;

let cached: AmendsEnv | null = null;

export function loadServerEnv() {
  if (cached) return cached;

  // Only parse a curated subset of process.env to avoid rejecting unrelated env vars.
  const safePick: Record<string, string | undefined> = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_MODEL: process.env.OPENAI_MODEL,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_NORTHSTAR_SUBSCRIPTION_ITEM_ID: process.env.STRIPE_NORTHSTAR_SUBSCRIPTION_ITEM_ID,
    STRIPE_GRANDFATHERED_PRICE_ID: process.env.STRIPE_GRANDFATHERED_PRICE_ID,
    STRIPE_NEW_PRICE_ID: process.env.STRIPE_NEW_PRICE_ID,
    NOTION_TOKEN: process.env.NOTION_TOKEN,
    NOTION_PAGE_ID: process.env.NOTION_PAGE_ID,
    SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
    SLACK_CHANNEL_ID: process.env.SLACK_CHANNEL_ID,
    SLACK_APPROVER_USER_ID: process.env.SLACK_APPROVER_USER_ID,
  };

  const parsed = AmendsEnvSchema.safeParse(safePick);
  if (!parsed.success) {
    const issues = parsed.error.format();
    // Throw an error with concise message suitable for server startup logs.
    throw new Error('Invalid server environment: ' + JSON.stringify(issues));
  }

  // Do not export raw secrets to client code. Return typed server-only object.
  cached = parsed.data;
  return cached;
}
