import { PostgresPersistence } from "./postgres.js";

/** Amends uses Neon/Postgres in every environment; there is no local fallback. */
export function createPersistence(): PostgresPersistence {
  return new PostgresPersistence();
}

export { PostgresPersistence } from "./postgres.js";
export type { ActionRecord, RunRecord } from "./postgres.js";
