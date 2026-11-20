import { fingerprint } from "./canonical.js";
import { EffectLedger } from "./ledger.js";
import { authorize } from "./policy.js";
import { assertFreshSnapshot } from "./snapshot.js";

export class BrowserBridge {
  constructor({ ledger = new EffectLedger() } = {}) {
    this.ledger = ledger;
  }

  prepare(request) {
    const policy = authorize(request);
    if (!policy.allowed) return { ok: false, stage: "policy", reason: policy.reason };

    try {
      assertFreshSnapshot(request.snapshot, {
        origin: request.origin,
        minRevision: request.minRevision ?? 0,
        now: request.now ?? Date.now(),
        maxAgeMs: request.maxSnapshotAgeMs ?? 30_000,
      });
    } catch (error) {
      return {
        ok: false,
        stage: "snapshot",
        reason: error instanceof Error ? error.message : "snapshot_invalid",
      };
    }

    const effect = fingerprint({
      origin: request.origin,
      action: request.action,
      target: request.target,
      value: request.value ?? null,
    });

    const status = this.ledger.status(effect);
    if (status === "committed") {
      return { ok: true, stage: "already_committed", fingerprint: effect };
    }
    if (status === "rejected") {
      return { ok: false, stage: "already_rejected", fingerprint: effect };
    }
    if (status === "ambiguous") {
      return {
        ok: false,
        stage: "ambiguous",
        reason: "manual_verification_required",
        fingerprint: effect,
      };
    }

    try {
      this.ledger.recordIntent(effect);
    } catch (error) {
      // A durable ledger may have reserved the same effect in another executor.
      if (error?.message !== "intent_not_new") throw error;
      return { ok: false, stage: "ambiguous", reason: "manual_verification_required", fingerprint: effect };
    }
    return {
      ok: true,
      stage: "ready_for_single_write",
      fingerprint: effect,
      snapshotDigest: request.snapshot.digest,
      preview: {
        origin: request.origin,
        action: request.action,
        target: request.target,
        value: request.value ?? null,
      },
    };
  }

  commit(effectFingerprint) {
    this.ledger.recordCommit(effectFingerprint);
    return { ok: true, stage: "committed", fingerprint: effectFingerprint };
  }

  reject(effectFingerprint) {
    this.ledger.recordReject(effectFingerprint);
    return { ok: false, stage: "rejected", fingerprint: effectFingerprint };
  }
}
