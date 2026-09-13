/**
 * ChronoMCP is third-party infrastructure. Keep this record next to the
 * integration so attribution and provenance cannot be lost during handoff.
 */
export const CHRONOMCP_ATTRIBUTION = {
  name: "ChronoMCP",
  upstreamUrl: "https://github.com/chronomcp/chronomcp",
  pinnedCommit: "f8880665c4274aa4b6a798805a20ea55e9174866",
  license: "MIT",
  purpose: "MCP mutation interception and deterministic compensation boundary",
} as const;

export const CHRONOMCP_BOUNDARY =
  "ChronoMCP may guard approved provider mutations; Amends owns intent extraction, semantic comparison, impact, recovery selection, and final verification." as const;
