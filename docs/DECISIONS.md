# Team B Decisions

## ChronoMCP Phase 0

- Upstream: https://github.com/chronomcp/chronomcp
- License: MIT; preserved in `LICENSES/CHRONOMCP_LICENSE`.
- Pinned checkout: `f8880665c4274aa4b6a798805a20ea55e9174866`.
- Retained boundary: Amends uses deterministic compensation concepts at the mutation boundary; semantic intent, comparison, impact, allowlisting, and verification remain Amends code.
- Evidence: upstream build and typecheck passed; 65 upstream tests passed, with one optional integration test canceled because external MCP servers were unavailable.
- Fallback: Amends keeps fixed allowlisted compensation handlers and does not depend on an LLM for rollback.

## Stripe safety

- Test-mode keys only (`sk_test_`).
- Provider identifiers are server configuration, never model-generated inputs.
- Recovery preserves configured quantity and uses `proration_behavior = none`.
- A changed invoice fingerprint fails recovery verification.
