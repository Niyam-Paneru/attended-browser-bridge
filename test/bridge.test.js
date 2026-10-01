import test from "node:test";
import assert from "node:assert/strict";

import { BrowserBridge } from "../src/bridge.js";
import { fingerprint } from "../src/canonical.js";

const grant = () => ({
  expiresAt: Date.now() + 60_000,
  origins: ["https://example.test"],
  actions: ["click", "type"],
});

test("canonical fingerprints ignore object key order", () => {
  assert.equal(fingerprint({ b: 2, a: 1 }), fingerprint({ a: 1, b: 2 }));
});

test("missing grant denies", () => {
  const bridge = new BrowserBridge();
  assert.equal(
    bridge.prepare({ origin: "https://example.test", action: "click", target: "#x" }).reason,
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
  });
  assert.equal(result.reason, "origin_not_allowed");
});

test("wrong action denies", () => {
  const bridge = new BrowserBridge();
  const result = bridge.prepare({
    origin: "https://example.test",
    action: "delete-account",
    target: "#x",
    grant: grant(),
  });
  assert.equal(result.reason, "action_not_allowed");
});

test("expired grant denies", () => {
  const bridge = new BrowserBridge();
  const result = bridge.prepare({
    origin: "https://example.test",
    action: "click",
    target: "#x",
    grant: { ...grant(), expiresAt: Date.now() - 1 },
  });
  assert.equal(result.reason, "grant_expired");
});

test("fresh effect becomes one ready write", () => {
  const bridge = new BrowserBridge();
  const result = bridge.prepare({
    origin: "https://example.test",
    action: "click",
    target: "#save",
    grant: grant(),
  });
  assert.equal(result.stage, "ready_for_single_write");
});

test("unresolved intent blocks replay", () => {
  const bridge = new BrowserBridge();
  const request = {
    origin: "https://example.test",
    action: "click",
    target: "#save",
    grant: grant(),
  };
  const first = bridge.prepare(request);
  const second = bridge.prepare(request);
  assert.equal(first.stage, "ready_for_single_write");
  assert.equal(second.stage, "ambiguous");
});

test("committed effect is idempotent", () => {
  const bridge = new BrowserBridge();
  const request = {
    origin: "https://example.test",
    action: "click",
    target: "#save",
    grant: grant(),
  };
  const first = bridge.prepare(request);
  bridge.commit(first.fingerprint);
  const replay = bridge.prepare(request);
  assert.equal(replay.stage, "already_committed");
});
