import test from "node:test";
import assert from "node:assert/strict";

import { EffectLedger } from "../src/ledger.js";

test("intent creates ambiguous state until committed", () => {
  const ledger = new EffectLedger();
  ledger.recordIntent("x");
  assert.equal(ledger.status("x"), "ambiguous");
});

test("commit requires an existing intent", () => {
  const ledger = new EffectLedger();
  assert.throws(() => ledger.recordCommit("x"), /commit_without_intent/);
});

test("committed effect stays committed", () => {
  const ledger = new EffectLedger();
  ledger.recordIntent("x");
  ledger.recordCommit("x");
  assert.equal(ledger.status("x"), "committed");
});
