import { fingerprint } from "./canonical.js";
import { EffectLedger } from "./ledger.js";
import { authorize } from "./policy.js";

export class BrowserBridge {
  constructor({ ledger = new EffectLedger() } = {}) {
    this.ledger = ledger;
  }

  prepare(request) {
    const policy = authorize(request);
    if (!policy.allowed) return { ok: false, stage: "policy", reason: policy.reason };

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
    if (status === "ambiguous") {
      return { ok: false, stage: "ambiguous", reason: "manual_verification_required", fingerprint: effect };
    }

    this.ledger.recordIntent(effect);
    return {
      ok: true,
      stage: "ready_for_single_write",
      fingerprint: effect,
      preview: {
        origin: request.origin,
        action: request.action,
        target: request.target,
        value: request.value ?? null,
      },
    };
  }

  commit(fingerprint) {
    this.ledger.recordCommit(fingerprint);
    return { ok: true, stage: "committed", fingerprint };
  }
}
