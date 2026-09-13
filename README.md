# Amends

Intent-aware recovery infrastructure for AI agents.

Amends is a recovery layer for agentic systems that execute API calls and still drift from the user’s intent. It inspects real provider state, measures business exposure, requires human approval, runs allowlisted compensating actions, and independently verifies the outcome before a run is considered recovered.

<!-- Add final dashboard screenshot here -->

## Demo status

The locked recovery scenario has been exercised end-to-end through the Amends dashboard.

**Current verified result:**

- exactly 2 business mismatches detected
- $2,610/month exposure calculated
- exact Slack approval required: `APPROVE AMN-2027-0042`
- recovery executed through the guarded workflow
- Stripe restored to $99 × 87 seats in the deterministic test path
- Notion restored to `new_customers_only`
- existing customers remain at $99 and new customers at $129
- recovery receipt recorded
- final state: **VERIFIED 5/5**

The repository validation gate currently passes:

- 53 tests
- 53 pass
- 0 fail
- 0 skipped
- lint pass
- TypeScript pass
- production build pass
- secret scan pass
- Neon persistence integration pass

## Demo

[![Watch the Amends demo](public/amends-demo.png)]([YOUR_GOOGLE_DRIVE_VIDEO_LINK](https://drive.google.com/drive/folders/14NAg8qFUmXAwlB-ClhWDhm1SJdWiOkIq?usp=sharing))

**2-minute demo:** Intent mismatch detection → $2,610/month exposure → Slack approval → guarded recovery → VERIFIED 5/5.

## Problem

A 200 OK response is not evidence that the agent fulfilled the user’s intent.

In the locked demo scenario, the intent is:

- launch Pro 2027 at $129 per seat for new customers only
- keep existing enterprise customers grandfathered at $99 per seat
- Northstar currently has 87 seats

A faulty execution still reaches the success path while making the wrong changes in production:

- Stripe: Northstar moves to $129 instead of staying at $99
- Notion: scope changes to all customers instead of new_customers_only
- Slack: the approval signal is still expected to gate the recovery path

The system must detect that drift, calculate the business exposure, and repair it with a constrained, verifiable workflow.

## Demo / How it works

```text
User Intent
  -> Outcome Contract
  -> Agent Execution
  -> Inspect Real Systems
  -> Intent / State Diff
  -> Business Exposure
  -> Deterministic Recovery Plan
  -> Human Approval
  -> Compensating Actions
  -> Independent Re-read
  -> Verified Recovery
```

Amends treats the user intent as a contract. It inspects the actual provider state, compares it to the intended outcome, and calculates whether the drift creates business risk. If it does, the runtime builds a deterministic recovery plan, requires exact human approval, performs only allowlisted compensating actions, and rereads the systems to confirm that the restored state matches the intended outcome.

## Concrete demo evidence

The demo scenario is fixed and deterministic:

- 2 mismatches are identified: Stripe pricing and Notion scope drift
- exposure = 87 × ($129 - $99) = $2,610/month
- recovery requires the exact Slack approval command: `APPROVE <RUN_CODE>`
- Stripe is restored to $99 × 87
- Notion is restored to `new_customers_only`
- the policy remains: existing $99 / new $129
- exactly one Slack recovery receipt is posted
- final verification shows 5/5 checks passed

This is the operational proof that recovery happened without inventing new provider behavior.

## Why Amends

Observability tells you what happened. Amends checks whether what happened matched the user’s intent and repairs the difference.

That is the wedge:

- standard monitoring answers: “what changed?”
- Amends answers: “did this match the intended business outcome, and if not, how do we recover safely?”

In other words, Amends sits between agent intent and production state as the recovery layer that enforces correctness rather than just logging events.

## Architecture

```text
User Intent / Outcome Contract
          |
          v
     Amends Runtime
   /      |       \
  v       v        v
Stripe   Notion   Slack
  |        |        |
  v        v        v
  Real provider state  Approval + receipt
          \
           \-> Neon / Postgres persistence
```

The runtime is intentionally small and explicit:

- it ingests the intended outcome
- it inspects the live provider state
- it compares intent against actual state
- it computes business exposure
- it builds a deterministic recovery plan
- it requires human approval
- it executes only allowlisted compensating actions
- it verifies by independent rereads before marking the run as recovered

## Safety model

Amends is designed to fail safely and to keep the model honest.

- the model cannot invent provider operations
- provider IDs are server-controlled; clients cannot supply them
- Stripe runs in test mode for the demo path
- approval is exact: `APPROVE <RUN_CODE>`
- recovery plans use deterministic canonical hashes
- actions are idempotent and attempt-limited
- precondition checks reject invalid or duplicate recovery attempts
- independent rereads are required before final verification is accepted

The runtime only allows the following recovery actions:

- `RESTORE_STRIPE_GRANDFATHERED_PRICE`
- `RESTORE_NOTION_PRICING_POLICY`
- `POST_SLACK_RECOVERY_RECEIPT`

## Tech stack

The repository currently uses:

- Next.js App Router
- React + TypeScript
- Node.js + tsx
- PostgreSQL / Neon via `postgres.js`
- SQLite for local persistence and local verification
- Zod validation
- ESLint and TypeScript build checks

## Running locally

```bash
npm install
cp .env.example .env.local
# fill in the required local values, including DATABASE_URL when using Neon
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000/).

For the live Neon/Postgres persistence proof, run:

```bash
set -a && source .env.local && set +a
npm run db:migrate
npx tsx --test src/infrastructure/persistence/postgres-demo-run-repository.test.ts
```

## Validation

Run the current repo gate:

```bash
npm test
npm run lint
npm run typecheck
npm run build
npm run security:secrets
```

Current verified status for this revision:

- 53 tests
- 53 pass
- 0 fail
- 0 skipped

Local `.env.local` files are Git-ignored and excluded from the secret scanner; committed source, configuration, documentation, and example environment files remain scanned.

## Repository structure

The repository is organized around the actual product and runtime boundaries:

- `src/app/` — Next.js API routes and application boundary
- `src/domain/` — run orchestration, contracts, recovery logic, state transitions, and validation
- `src/infrastructure/` — persistence implementations and adapters
- `src/lib/` — environment and support utilities
- `scripts/` — migration and security scripts
- `docs/` — product and architecture notes
- `public/` — static assets

## Larger vision

Amends is the recovery layer between agent intent and production state.

It is not a generic “AI wrapper.” It is a narrow, operational control plane that makes agent execution accountable to business intent and human approval.
