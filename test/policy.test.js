import test from "node:test";
import assert from "node:assert/strict";

import { authorize } from "../src/policy.js";

const grant = () => ({
  expiresAt: Date.now() + 60_000,
  origins: ["https://example.test"],
  actions: ["click"],
});

test("origin outside grant is denied", () => {
  assert.equal(authorize({ origin: "https://other.test", action: "click", grant: grant() }).reason, "origin_not_allowed");
});

test("action outside grant is denied", () => {
  assert.equal(authorize({ origin: "https://example.test", action: "type", grant: grant() }).reason, "action_not_allowed");
});

test("expired grant is denied", () => {
  assert.equal(
    authorize({
      origin: "https://example.test",
      action: "click",
      grant: { ...grant(), expiresAt: Date.now() - 1 },
    }).reason,
    "grant_expired"
  );
});
