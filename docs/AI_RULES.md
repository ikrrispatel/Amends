# Amends AI Implementation Rules

**Team:** 200 Wrong  
**Product:** Amends — IntentLock demo  
**Authority:** Non-negotiable instructions for humans and coding agents

## 1. Prime directive

Build the smallest honest, repeatable demonstration that proves this statement:

> An AI workflow can receive successful responses from Stripe, Notion, and Slack while still producing a business outcome that violates the user's instruction. Amends detects that semantic violation, proposes only allowlisted compensating actions, requires human approval, executes once, and verifies the final state.

Optimize for a reliable two-minute live demo. Generated code volume, generalized architecture, and production appearance are secondary.

## 2. Authority and phase control

Read these files completely before any implementation:

1. `docs/AI_RULES.md`
2. `docs/PRD.md`
3. `docs/Architecture.md`
4. `docs/plan.md`
5. `docs/TEAM_SCHEDULE.md`

Precedence follows that order. If requirements conflict, quote both passages and stop. Person A is the only scope and merge authority.

Work on one phase at a time. A later phase begins only after its predecessor's gate passes and Person A writes:

```text
CONTINUE TO PHASE <number>
```

Before editing, report current phase, one objective, exact files, checks, security invariants, and excluded work. Inspect `git status` and preserve unrelated changes.

## 3. Locked scope

### Exactly three external applications

1. Stripe test mode
2. Notion synthetic demo page/database
3. Slack synthetic demo channel

No fourth integration.

### One scenario

The Slack instruction launches Pro 2027 at `$129/seat` for new customers only. Existing customer Northstar has `87` seats at `$99/seat` and must remain grandfathered. A deterministic fault-injection workflow incorrectly reprices Northstar, changes the Notion policy, and posts a success message. Amends must detect and recover this exact incident.

### Exactly three permitted recovery actions

1. `RESTORE_STRIPE_GRANDFATHERED_PRICE`
2. `RESTORE_NOTION_PRICING_POLICY`
3. `POST_SLACK_RECOVERY_RECEIPT`

No arbitrary provider method, URL, command, SQL, tool name, or model-generated executable action is permitted.

## 4. ChronoMCP boundary

ChronoMCP is third-party MIT-licensed infrastructure and must remain attributed with its upstream URL and pinned commit hash. It may supply MCP interception, risk labels, approval-gate concepts, audit patterns, and deterministic compensation mechanics.

Team 200 Wrong must build:

- instruction-to-outcome contract extraction;
- strict schema validation;
- trusted fixture/identifier resolution;
- normalized cross-app state reads;
- expected-versus-actual comparison;
- deterministic financial impact calculation;
- allowlisted recovery-plan creation;
- final five-check verification;
- judge-facing incident dashboard.

Never claim ChronoMCP's existing work as hackathon work. Never present compensation as literal undo.

ChronoMCP is conditional: it has a 30-minute Phase 0 gate. If install, tests, demo, or integration fails, record the decision and implement only the three fixed compensation handlers directly. Do not debug upstream beyond the gate.

## 5. LLM boundary

The LLM may only:

- transform the exact Slack instruction into `OutcomeContractV1`;
- produce a human-readable incident explanation from already computed facts.

The LLM may not:

- invent or select provider IDs;
- call mutation APIs directly;
- calculate money;
- determine whether verification passed;
- create arbitrary recovery actions;
- bypass approval;
- change code, prompts, policies, credentials, or infrastructure during a run.

Model output is untrusted. Validate it with a strict schema that rejects unknown fields, unsupported values, excessive length, and malformed data. Convert model labels to trusted configured IDs only through exact server-side mappings. If validation fails, enter `MANUAL_REVIEW`; do not guess.

## 6. Security invariants

- Stripe must be test mode. Reject live keys and live objects.
- Use synthetic data only.
- Secrets stay in ignored server-side environment files; never in source, logs, screenshots, prompts, browser bundles, `NEXT_PUBLIC_*`, or Git history.
- Provider IDs and model output are untrusted until allowlist-validated.
- Mutations require exact run state, exact preconditions, approval code, actor allowlist, unexpired plan, and matching plan hash.
- Every mutation has a deterministic idempotency key and executes at most once.
- Slack approval grammar is exactly `APPROVE <RUN_CODE>` from one configured approver.
- APIs reject unknown fields, oversized bodies, wrong methods, and invalid content types.
- UI receives redacted projections, never raw provider payloads or secrets.
- Logs contain request/run IDs, action names, state transitions, durations, and sanitized errors—not credentials or full customer content.
- Errors fail closed and expose no stack traces or provider internals.
- No dangerous operation is inferred as reversible. Irreversible effects are labeled honestly.
- Never weaken a guard to make a test or demo pass.

## 7. Coding constraints

- Strict TypeScript; no `any`, unchecked casts, ignored errors, or disabled lint rules.
- Pin dependency versions and commit the lockfile.
- Prefer direct official SDKs over new frameworks.
- Domain comparison, impact, plan, transitions, and verification are pure deterministic functions.
- Provider SDK imports stay server-side.
- Every route performs schema validation and safe error handling.
- Do not add abstractions until two real call sites require them.
- Do not silently mock a provider behavior represented as live.

## 8. Claims forbidden

Do not claim zero hallucination, perfect security, production readiness, universal rollback, guaranteed recovery, autonomous financial control, or compatibility with every agent/application.

Use: **bounded, human-approved, compensating recovery for one verified scenario.**

## 9. Definition of complete

Complete means the golden run can be reset and demonstrated twice consecutively; all three applications are read live; exactly two mismatches and `$2,610/month at risk` are shown; approval is real; corrections are idempotent; all five deterministic checks pass; third-party reuse is attributed; and a backup recording exists.
