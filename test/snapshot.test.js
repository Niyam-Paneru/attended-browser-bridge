import test from "node:test";
import assert from "node:assert/strict";

import { assertFreshSnapshot, snapshotTicket } from "../src/snapshot.js";

test("fresh snapshot is accepted", () => {
  const ticket = snapshotTicket({
    origin: "https://example.test",
    revision: 4,
    observedAt: 1_000,
  });
  assert.equal(
    assertFreshSnapshot(ticket, {
      origin: "https://example.test",
      minRevision: 4,
      now: 2_000,
      maxAgeMs: 5_000,
    }),
    true
  );
});

test("old revision is rejected", () => {
  const ticket = snapshotTicket({
    origin: "https://example.test",
    revision: 2,
    observedAt: 1_000,
  });
  assert.throws(
    () => assertFreshSnapshot(ticket, {
      origin: "https://example.test",
      minRevision: 3,
      now: 2_000,
    }),
    /snapshot_revision_stale/
  );
});

test("old observation is rejected", () => {
  const ticket = snapshotTicket({
    origin: "https://example.test",
    revision: 3,
    observedAt: 1_000,
  });
  assert.throws(
    () => assertFreshSnapshot(ticket, {
      origin: "https://example.test",
      minRevision: 3,
      now: 40_000,
      maxAgeMs: 5_000,
    }),
    /snapshot_too_old/
  );
});
