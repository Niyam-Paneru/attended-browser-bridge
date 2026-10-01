export class EffectLedger {
  #rows = [];

  entries() {
    return this.#rows.map((row) => ({ ...row }));
  }

  status(fingerprint) {
    const rows = this.#rows.filter((row) => row.fingerprint === fingerprint);
    if (rows.some((row) => row.kind === "effect_commit")) return "committed";
    if (rows.some((row) => row.kind === "effect_intent")) return "ambiguous";
    return "new";
  }

  recordIntent(fingerprint) {
    if (this.status(fingerprint) !== "new") {
      throw new Error("intent_not_new");
    }
    this.#rows.push({ kind: "effect_intent", fingerprint });
  }

  recordCommit(fingerprint) {
    if (this.status(fingerprint) !== "ambiguous") {
      throw new Error("commit_without_intent");
    }
    this.#rows.push({ kind: "effect_commit", fingerprint });
  }
}
