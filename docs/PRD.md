# Product Requirements Document — Amends IntentLock

## 1. Product statement

Amends is a semantic outcome-assurance and bounded recovery layer for AI workflows that mutate multiple business applications.

APIs answer whether commands executed. Amends answers whether the resulting business state matches the human's original intent.

## 2. User and problem

The demo user is an operations or support manager supervising AI workflows with write access to billing, policy, and communication systems.

The dangerous failure is not a timeout or `500`. Every tool call returns success, but the combined outcome is wrong. Existing tool-level monitoring can miss this because each isolated call was valid.

## 3. Locked demonstration

### Original Slack instruction

> Launch the Pro 2027 plan at $129 per seat for new customers only. Northstar and every existing enterprise customer stay grandfathered at $99 per seat. Update our pricing policy and confirm when complete.

### Expected state

| System | Expected outcome |
|---|---|
| Stripe | Northstar remains active at `$99/seat`, quantity `87` |
| Notion | `scope = new_customers_only`; existing price `$99`; new price `$129` |
| Slack | Original instruction remains available as evidence |

### Injected successful-but-wrong state

| System | Wrong outcome |
|---|---|
| Stripe | Northstar item changes to `$129/seat`, quantity still `87`, without proration |
| Notion | Scope becomes `all_customers`; existing price becomes `$129` |
| Slack | Fault workflow posts that rollout completed successfully |

The calculated exposure is deterministic:

`87 × ($129 − $99) = $2,610/month at risk`.

This is exposure, not a completed charge, refund, or proven loss.

## 4. Core user journey

1. Operator resets the synthetic resources to the expected baseline.
2. Operator triggers the clearly labeled fault-injection workflow.
3. Stripe, Notion, and Slack all report successful operations.
4. Operator starts an Amends inspection.
5. Amends reads the Slack instruction and creates a strict outcome contract using one bounded LLM call.
6. Amends rereads Stripe and Notion through narrow adapters.
7. Deterministic comparison produces exactly two business-record mismatches and calculates exposure.
8. Amends creates a fixed recovery plan and stable plan hash.
9. Slack receives an approval request containing impact, actions, irreversible limits, run code, and expiration.
10. Configured approver replies `APPROVE <RUN_CODE>`.
11. Amends validates actor, run code, state, expiration, preconditions, and plan hash.
12. Amends executes the two compensating mutations exactly once and posts one Slack receipt.
13. Amends rereads all three applications.
14. Dashboard reports success only when all five checks pass.

## 5. Required features

### P0 features

- Seed/reset command for synthetic baseline.
- Deterministic fault-injection command.
- Bounded Slack instruction reader.
- Strict `OutcomeContractV1` extraction and validation.
- Stripe/Notion normalized state readers.
- Expected-versus-actual mismatch engine.
- Integer-cent impact calculator.
- Fixed recovery planner with exactly three action variants.
- Plan hash, expiration, preconditions, state transitions, audit events, and idempotency.
- Slack approval request and approval polling.
- Stripe and Notion compensating writes.
- Slack recovery receipt.
- Five deterministic final checks.
- One projector-readable dashboard.
- Demo reset, golden E2E test, backup recording, and attribution.

### Dashboard requirements

One run-detail screen must show:

- original instruction;
- run state and progress;
- three application cards;
- expected vs actual values;
- two mismatches;
- `$2,610/month at risk`;
- recovery actions and reversibility labels;
- approval status and exact Slack command;
- append-only timeline;
- final `5/5` verification result.

Use red only for actual mismatch/failure, amber for waiting/approval, and green only for deterministically verified conditions. Animations are limited to state transitions and must not conceal latency.

## 6. Five final verification checks

1. Stripe Northstar unit amount is exactly `9_900` cents and subscription remains active.
2. Stripe quantity is exactly `87`, with no new invoice/proration fingerprint created by recovery.
3. Notion scope is exactly `new_customers_only`.
4. Notion existing price is `9_900` cents and new-customer price is `12_900` cents.
5. Exactly one current-run Slack recovery receipt exists and identifies the approved run.

The UI must not claim recovered if any check is false or unavailable.

## 7. Success metrics

- Cold reset-to-verification completes in under two minutes under normal sandbox conditions.
- Two consecutive golden runs succeed.
- Exactly three real external applications are visibly involved.
- Wrong state produces exactly two business-record mismatches.
- Correct state produces zero recovery actions.
- Repeated execution produces no duplicate mutation or receipt.
- A judge can explain the difference between API success and business success after the demo.

## 8. What the product is not

P0 is not a general SaaS product, multi-tenant platform, workflow builder, observability vendor, digital twin, prompt optimizer, autonomous billing agent, universal rollback engine, generic MCP proxy, multi-agent swarm, or support application.

P0 does not include production Stripe, customer onboarding, public signup, subscriptions for Amends, arbitrary apps/actions, broad natural-language support, mobile UI, background job infrastructure, comprehensive analytics, or enterprise compliance claims.

## 9. Honest reuse and originality

ChronoMCP may provide tool-level interception/compensation infrastructure. Amends' original work is semantic intent extraction, cross-application outcome evaluation, financial impact, allowlisted recovery selection, and verified post-recovery business state.

Judge-facing distinction:

> Tool guards handle calls that fail. Amends catches workflows whose calls all succeeded but whose business outcome is wrong.

## 10. Failure behavior

- LLM/schema failure → `MANUAL_REVIEW`.
- Provider read uncertainty → `INSPECTION_FAILED`; no plan.
- Unknown ID/value → reject and require manual review.
- Missing/invalid approval → remain pending.
- Changed precondition or expired plan → invalidate and re-inspect.
- Partial recovery → stop further unsafe work, report exact verified state, and never claim success.
- Provider outage during demo → show the honest failed state and use the backup recording only after explaining it.
