# Implementation Plan — Amends IntentLock

## Operating rule

Exactly one phase is active. Person A authorizes each phase only after the previous gate passes. A failed gate stops forward work. Cut scope before adding time.

## Phase 0 — Repository, upstream spike, and decision lock

**Budget:** 30 minutes  
**Objective:** Prove whether ChronoMCP saves time and establish a reproducible repository.

1. Add the five canonical docs, `DECISIONS.md`, and `BUILD_LOG.md`.
2. Record organizer rules regarding reuse, pre-existing work, attribution, repository visibility, localhost, and external sandbox preparation.
3. Tag the documentation-only starting point and create `hackathon/intentlock`.
4. Clone ChronoMCP separately; record upstream URL, license, and commit hash.
5. Run install, tests, build, and its compensation demo.
6. Make a 30-minute keep/drop decision. If dropped, use direct fixed handlers.
7. Scaffold strict Next.js, pin Node/pnpm/dependencies, add environment validation and secret scanning.

**Gate:** App builds; no secret is tracked; ChronoMCP decision is documented with evidence; every teammate can state the exact three apps, scenario, and originality boundary.

## Phase 1 — Deterministic domain core

**Budget:** 35 minutes  
**Objective:** Prove semantic comparison and recovery planning without providers.

1. Freeze strict schemas and provider-port signatures.
2. Implement integer-cent impact calculation.
3. Implement comparison producing exactly two mismatches for the broken fixture.
4. Implement exactly three recovery-action variants.
5. Implement canonical serialization, plan hash, expiration, legal transitions, and five-check verification.
6. Add correct, broken, malformed, unknown-ID, repeated-action, and transition tests.

**Gate:** Broken fixture returns two mismatches, `261_000` cents exposure, and the exact plan; correct fixture returns zero actions; all unit tests pass.

## Phase 2 — Real application spike and adapters

**Budget:** 75 minutes  
**Objective:** Establish real reads/writes and repeatable synthetic state.

Parallel work begins only after Person A freezes ports.

- Person B: Stripe test adapter and `$99 → $129 → $99` round trip preserving quantity `87` with no proration.
- Person C: Notion adapter/reset/fault round trip and Slack read/post/approval-polling round trip.
- Person A: adapter composition, normalized-state contracts, and audit persistence.

**Checkpoint at 35 minutes:** one real read from all three apps. If any is missing, simplify permissions/API path immediately.

**Gate:** Reset and fault scripts deterministically create expected and wrong state; all three apps reread successfully; repeated restore and posts are idempotent.

## Phase 3 — Semantic inspection and incident creation

**Budget:** 55 minutes  
**Objective:** Convert Slack intent into a strict contract and detect successful-but-wrong state.

1. Read the exact Slack instruction.
2. Make one bounded Structured Outputs model call.
3. Validate output and resolve aliases to trusted configuration.
4. Read normalized provider state.
5. Compare deterministically and persist sanitized evidence.
6. Produce fixed recovery plan, financial exposure, expiration, preconditions, and hash.

**Gate:** Real wrong state displays two mismatches and `$2,610/month at risk`; malformed output fails to manual review; no model-generated identifier reaches an adapter.

## Phase 4 — Approval, compensation, and verification

**Budget:** 60 minutes  
**Objective:** Complete the plain end-to-end loop before UI polish.

1. Post one Slack approval request.
2. Poll bounded replies and accept only the allowlisted actor/exact command.
3. Revalidate state, plan hash, expiry, and preconditions.
4. Execute Stripe then Notion corrections exactly once through retained ChronoMCP boundary or direct fixed handlers.
5. Post one Slack recovery receipt.
6. Reread all three applications and evaluate five checks.
7. Add golden E2E and critical failure drills.

**Gate:** Two consecutive terminal-driven golden runs reach `VERIFIED 5/5`; wrong actor, expired plan, changed precondition, and repeated execution fail safely.

## Phase 5 — Judge-facing dashboard

**Budget:** 45 minutes  
**Objective:** Make real system state understandable on a projector.

Build only the single run-detail screen from the PRD. Connect every visual to real sanitized run data. Add reset, inject fault, inspect, request approval, check approval, and execute controls. Use restrained transitions.

**Gate:** A teammate unfamiliar with implementation can narrate the complete demo without opening a terminal; green appears only after fresh `5/5` verification.

## Phase 6 — Hardening and demo reliability

**Budget:** 45 minutes  
**Objective:** Eliminate predictable live-demo failures.

Run formatting, linting, typecheck, unit/integration/E2E tests, dependency audit, secret scan, route abuse tests, idempotency test, provider timeout drill, and two cold golden rehearsals. Create reset instructions and a backup recording. Verify attribution and hackathon-start commit evidence.

**Gate:** Full check suite passes; no secret/client leak; backup recording matches current UI; frozen commit identified.

## Phase 7 — Freeze, pitch, and submit

**Budget:** 45 minutes  
**Objective:** Submit a truthful, reproducible project before the deadline.

1. Freeze features and merge only blockers.
2. Complete README: problem, architecture, live-vs-test truth, reuse attribution, setup, demo script, limitations.
3. Rehearse two-minute pitch and likely judge questions.
4. Submit at least 10 minutes early and open submission from another device.
5. Preserve commit hash and submission receipt.

**Gate:** Submission is accessible, demo is reproducible, and all claims match what runs.

## Rescue cuts

Apply in this order when behind:

1. Drop ChronoMCP integration but retain attribution for any borrowed code/concepts.
2. Replace dashboard animation with plain status updates.
3. Use terminal controls while retaining the state dashboard.
4. Remove model-generated explanation; keep structured contract extraction.
5. Remove public deployment and run locally.

Never cut a required external app, real state reread, approval validation, idempotency, test-mode guard, strict contract validation, or final verification.

## Standard checks

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm security:secrets
pnpm audit --audit-level=high
```

Commands become required only after their scripts are introduced in the corresponding phase.
