# Team Schedule — 200 Wrong

**Build window:** 390 minutes  
**Target:** One repeatable, live three-app recovery demonstration  
**Hard rule:** A plain complete loop beats an unfinished beautiful platform.

## Roles

| Person | Permanent ownership | Initial branch/path ownership |
|---|---|---|
| A — Captain/Integrator | Scope, clock, domain, orchestration, merges, pitch | `src/domain`, `src/application`, API composition, docs |
| B — Provider/Reliability | ChronoMCP spike, Stripe, persistence, idempotency, security tests | `src/chrono`, `src/integrations/stripe.ts`, DB/tests |
| C — Experience/Apps | Notion, Slack, dashboard, Playwright, recording | Notion/Slack adapters, `components`, pages, E2E |

Person A alone changes shared interfaces, phase status, and merges. No two people edit the same file simultaneously.

## Master schedule

| Elapsed | Phase | A | B | C | Required evidence |
|---:|---|---|---|---|---|
| `0–30` | 0 | Repo/docs/scaffold | ChronoMCP install/test/demo | Prepare synthetic Slack/Notion resources | Keep/drop decision; app builds |
| `30–65` | 1 | Freeze schemas; compare/plan | Review safety/idempotency | Build sanitized fixtures/projections | Two mismatches; `261_000` cents; tests |
| `65–140` | 2 | Compose adapters/audit | Stripe round trip | Notion + Slack round trips | Three real reads; deterministic reset/fault |
| `140–195` | 3 | Contract extraction/orchestration | Validate Stripe evidence | Validate Slack/Notion evidence | Real incident, exact impact and plan |
| `195–255` | 4 | State machine/merge | Stripe compensation/idempotency | Approval + Notion + receipt | Two consecutive `5/5` golden runs |
| `255–300` | 5 | Integrate screen/data | Reliability support | Dashboard and Playwright | Projector-readable live UI |
| `300–345` | 6 | Full gate, README, pitch | Security/failure drills | Rehearsal and backup video | Frozen passing commit |
| `345–390` | 7 | Pitch/submission authority | Independent demo verification | Submission/device verification | Submitted by `T+380` |

## Checkpoints

### T+30

- ChronoMCP is either retained with evidence or dropped permanently.
- No teammate continues debugging it after the deadline.
- Stack and upstream commit are recorded.

### T+65

- Shared types are frozen.
- Broken fixture yields exactly two mismatches and `$2,610/month at risk`.
- Correct fixture yields no recovery.

### T+100

- At least one real read from Stripe, Notion, and Slack.
- Missing integration becomes the entire team's blocker.

### T+140

- `$99 → $129 → $99` Stripe test round trip works.
- Notion reset/fault/restore works.
- Slack instruction/read/reply flow works.

### T+255 — non-negotiable

- Plain end-to-end reset → fault → inspect → approve → recover → verify works twice.
- If not, stop all UI work and enter rescue mode.

### T+300

- Dashboard tells the story without terminal narration.
- First backup recording exists.

### T+345

- Feature freeze.
- Full checks pass.
- Current commit and backup recording are recorded.

### T+380

- Submission uploaded and opened independently.
- Last 10 minutes are submission recovery only.

## Team operating rules

- Start each assignment with exact allowed files and required checks.
- Commit small working slices; never dump one giant AI-generated commit.
- Pull/rebase before handoff and announce shared-interface changes.
- Never share secrets in chat or screen share `.env`.
- Every provider write is against synthetic/test resources.
- If a gate fails, solve that gate; do not hide it with UI.
- Person A keeps a visible timer and calls checkpoint meetings lasting no more than three minutes.

## Demo responsibilities

- **A:** Deliver problem, trigger incident, explain semantic mismatch and close with differentiation.
- **B:** Operate/observe Stripe and answer reliability, compensation, idempotency, and ChronoMCP-attribution questions.
- **C:** Operate Slack/Notion/dashboard, handle approval, and run backup recording if needed.

## Two-minute demo sequence

| Time | Speaker/action |
|---:|---|
| `0:00–0:15` | A: “Every API can succeed while the business outcome is wrong.” Show Slack instruction. |
| `0:15–0:35` | C triggers fault; B shows wrong Stripe price; C shows wrong Notion policy and Slack success. |
| `0:35–0:55` | A runs inspection; dashboard shows two mismatches and `$2,610/month at risk`. |
| `0:55–1:15` | A shows smallest recovery plan and reversibility limits; C approves in Slack. |
| `1:15–1:40` | B executes; dashboard timeline reflects actual compensation events. |
| `1:40–1:55` | A shows fresh state reread and `5/5` verification. |
| `1:55–2:00` | A: “Tool guards protect calls. Amends proves the business outcome.” |

## Ownership if someone finishes early

1. Reproduce the current golden run from a clean reset.
2. Add a failure test for the component just completed.
3. Review another person's code without editing it.
4. Improve setup/demo documentation.
5. Do not invent a feature.

## Emergency fallback

If live provider reliability fails during judging, state which provider failed, show the preserved audit state, and play the current backup recording. Never describe a prerecorded or simulated action as live.
