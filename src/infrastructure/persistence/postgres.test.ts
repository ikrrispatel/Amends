import assert from "node:assert/strict";
import test from "node:test";
import { createPersistence } from "./index.js";

test("requires Neon DATABASE_URL and has no local fallback", () => {
  const previous = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  assert.throws(() => createPersistence(), /DATABASE_URL is required/);
  if (previous !== undefined) process.env.DATABASE_URL = previous;
});
