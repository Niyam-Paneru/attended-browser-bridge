import { fingerprint } from "./canonical.js";

export function snapshotTicket({ origin, revision, observedAt }) {
  if (!origin || !Number.isInteger(revision) || revision < 0 || !Number.isFinite(observedAt)) {
    throw new Error("invalid_snapshot");
  }
  return Object.freeze({
    origin,
    revision,
    observedAt,
    digest: fingerprint({ origin, revision, observedAt }),
  });
}

export function assertFreshSnapshot(ticket, { origin, minRevision, now = Date.now(), maxAgeMs = 30_000 }) {
  if (!ticket || ticket.origin !== origin) throw new Error("snapshot_origin_mismatch");
  if (ticket.revision < minRevision) throw new Error("snapshot_revision_stale");
  if (now - ticket.observedAt > maxAgeMs) throw new Error("snapshot_too_old");
  return true;
}
