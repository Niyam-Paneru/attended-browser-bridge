import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DurableEffectLedger } from "../src/durable-ledger.js";
import { BrowserBridge } from "../src/bridge.js";
import { snapshotTicket } from "../src/snapshot.js";

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), "ledger-test-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return { dir, ledger: new DurableEffectLedger(dir), reopen: () => new DurableEffectLedger(dir) };
}
test("intent survives reopening and exclusive second reservation fails", t => {
  const f = fixture(t); f.ledger.recordIntent("effect");
  assert.equal(f.reopen().status("effect"), "ambiguous");
  assert.throws(() => f.reopen().recordIntent("effect"), /intent_not_new/);
});
test("confirmation requires dispatch; ack is not confirmation", t => {
  const f = fixture(t); f.ledger.recordIntent("effect");
  assert.throws(() => f.ledger.recordCommit("effect"), /resolution_without_dispatch/);
  assert.throws(() => f.ledger.recordAcknowledgement("effect", 201), /ack_without_dispatch/);
  f.ledger.recordDispatch("effect"); f.ledger.recordAcknowledgement("effect", 201);
  assert.equal(f.reopen().status("effect"), "ambiguous");
  f.reopen().recordCommit("effect"); assert.equal(f.ledger.status("effect"), "committed");
  assert.throws(() => f.ledger.recordReject("effect"), /resolution_without_dispatch/);
});
test("dispatch is single-use even with another ledger instance", t => {
  const f = fixture(t); f.ledger.recordIntent("effect"); f.ledger.recordDispatch("effect");
  assert.throws(() => f.reopen().recordDispatch("effect"), /EEXIST/);
});
test("rejection is terminal and distinct from unknown", t => {
  const f = fixture(t); f.ledger.recordIntent("effect"); f.ledger.recordDispatch("effect"); f.reopen().recordReject("effect");
  assert.equal(f.ledger.status("effect"), "rejected"); assert.throws(() => f.ledger.recordIntent("effect"), /intent_not_new/);
});
test("truncated terminal record cannot be mistaken for success or a new write", t => {
  const f = fixture(t); f.ledger.recordIntent("effect"); f.ledger.recordDispatch("effect");
  writeFileSync(join(f.dir, readdirSync(f.dir)[0], "resolution.json"), "{");
  assert.throws(() => f.reopen().status("effect"), SyntaxError);
});
test("public bridge gracefully denies a competing reservation", t => {
  const f = fixture(t), origin = "http://127.0.0.1:1", now = Date.now();
  const request = { origin, action: "submit", target: "ticket", value: "synthetic", grant: { expiresAt: now+1000, origins: [origin], actions: ["submit"] }, snapshot: snapshotTicket({ origin, revision: 1, observedAt: now }), now };
  const racingLedger = { status: () => "new", recordIntent: effect => { f.ledger.recordIntent(effect); f.ledger.recordIntent(effect); } };
  assert.equal(new BrowserBridge({ ledger: racingLedger }).prepare(request).stage, "ambiguous");
  assert.equal(new BrowserBridge({ ledger: f.reopen() }).prepare(request).stage, "ambiguous");
});
