import test from "node:test";
import assert from "node:assert/strict";

import { BrowserBridge } from "../src/bridge.js";
import { fingerprint } from "../src/canonical.js";
import { snapshotTicket } from "../src/snapshot.js";

const ORIGIN = "https://example.test";
const NOW = 10_000;

const grant = (now = NOW) => ({
  expiresAt: now + 60_000,
  origins: [ORIGIN],
  actions: ["click", "type"],
});

const request = (overrides = {}) => ({
  origin: ORIGIN,
  action: "click",
  target: "#save",
  grant: grant(),
  snapshot: snapshotTicket({
    origin: ORIGIN,
    revision: 4,
    observedAt: 9_000,
  }),
  minRevision: 4,
  now: NOW,
  maxSnapshotAgeMs: 5_000,
  ...overrides,
});

test("canonical fingerprints ignore object key order", () => {
  assert.equal(fingerprint({ b: 2, a: 1 }), fingerprint({ a: 1, b: 2 }));
});

test("missing grant denies", () => {
  const bridge = new BrowserBridge();
  assert.equal(
    bridge.prepare({ origin: ORIGIN, action: "click", target: "#x" }).reason,
    "missing_grant"
  );
});

test("wrong origin denies", () => {
  const bridge = new BrowserBridge();
  const result = bridge.prepare({
    origin: "https://evil.test",
    action: "click",
    target: "#x",
    grant: grant(),
    now: NOW,
  });
  assert.equal(result.reason, "origin_not_allowed");
});

test("wrong action denies", () => {
  const bridge = new BrowserBridge();
  const result = bridge.prepare({
    origin: ORIGIN,
    action: "delete-account",
    target: "#x",
    grant: grant(),
    now: NOW,
  });
  assert.equal(result.reason, "action_not_allowed");
});

test("expired grant denies", () => {
  const bridge = new BrowserBridge();
  const result = bridge.prepare({
    origin: ORIGIN,
    action: "click",
    target: "#x",
    grant: { ...grant(), expiresAt: NOW - 1 },
    now: NOW,
  });
  assert.equal(result.reason, "grant_expired");
});

test("stale snapshot blocks before intent is recorded", () => {
  const bridge = new BrowserBridge();
  const stale = snapshotTicket({
    origin: ORIGIN,
    revision: 4,
    observedAt: 1_000,
  });

  const result = bridge.prepare(request({ snapshot: stale }));

  assert.equal(result.stage, "snapshot");
  assert.equal(result.reason, "snapshot_too_old");
  assert.deepEqual(bridge.ledger.entries(), []);
});

test("invalid clock blocks before intent is recorded", () => {
  const bridge = new BrowserBridge();
  const result = bridge.prepare(request({ now: NaN }));
  assert.equal(result.stage, "policy");
  assert.equal(result.reason, "invalid_clock");
  assert.deepEqual(bridge.ledger.entries(), []);
});

test("unbounded snapshot age blocks before intent is recorded", () => {
  const bridge = new BrowserBridge();
  const result = bridge.prepare(request({ maxSnapshotAgeMs: Infinity }));
  assert.equal(result.stage, "snapshot");
  assert.equal(result.reason, "invalid_freshness_requirements");
  assert.deepEqual(bridge.ledger.entries(), []);
});

test("fresh effect becomes one ready write", () => {
  const bridge = new BrowserBridge();
  const result = bridge.prepare(request());
  assert.equal(result.stage, "ready_for_single_write");
});

test("unresolved intent blocks replay", () => {
  const bridge = new BrowserBridge();
  const effectRequest = request();
  const first = bridge.prepare(effectRequest);
  const second = bridge.prepare(effectRequest);
  assert.equal(first.stage, "ready_for_single_write");
  assert.equal(second.stage, "ambiguous");
});

test("committed effect is idempotent", () => {
  const bridge = new BrowserBridge();
  const effectRequest = request();
  const first = bridge.prepare(effectRequest);
  bridge.commit(first.fingerprint);
  const replay = bridge.prepare(effectRequest);
  assert.equal(replay.stage, "already_committed");
});
