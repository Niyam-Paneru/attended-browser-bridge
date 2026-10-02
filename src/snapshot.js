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

export function assertFreshSnapshot(
  ticket,
  {
    origin,
    minRevision = 0,
    now = Date.now(),
    maxAgeMs = 30_000,
  }
) {
  if (!Number.isFinite(now) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0 ||
      !Number.isInteger(minRevision) || minRevision < 0) {
    throw new Error("invalid_freshness_requirements");
  }
  if (!ticket) throw new Error("snapshot_required");
  if (!Number.isInteger(ticket.revision) || ticket.revision < 0 || !Number.isFinite(ticket.observedAt)) {
    throw new Error("invalid_snapshot");
  }

  const expectedDigest = fingerprint({
    origin: ticket.origin,
    revision: ticket.revision,
    observedAt: ticket.observedAt,
  });
  if (ticket.digest !== expectedDigest) throw new Error("snapshot_digest_mismatch");
  if (ticket.origin !== origin) throw new Error("snapshot_origin_mismatch");
  if (ticket.revision < minRevision) throw new Error("snapshot_revision_stale");
  if (ticket.observedAt > now) throw new Error("snapshot_from_future");
  if (now - ticket.observedAt > maxAgeMs) throw new Error("snapshot_too_old");
  return true;
}
