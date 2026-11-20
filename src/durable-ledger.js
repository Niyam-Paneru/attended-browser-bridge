import { createHash } from "node:crypto";
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";

// Local filesystem, trusted directory. Exclusive creation is the reservation;
// an interrupted or corrupt reservation never becomes a new write.
function syncDirectory(path) {
  if (process.platform === "win32") return; // Node cannot reliably fsync directories on Windows.
  const fd = openSync(path, "r");
  try { fsyncSync(fd); } finally { closeSync(fd); }
}

function createRecord(directory, name, record) {
  const fd = openSync(join(directory, name), "wx", 0o600);
  try {
    writeFileSync(fd, JSON.stringify(record) + "\n");
    fsyncSync(fd);
  } finally { closeSync(fd); }
  syncDirectory(directory);
}

const files = ["intent.json", "dispatch.json", "ack.json", "resolution.json"];

export class DurableEffectLedger {
  constructor(directory) {
    this.directory = resolve(directory);
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
  }

  #path(fingerprint) {
    if (typeof fingerprint !== "string" || !fingerprint) throw new Error("invalid_fingerprint");
    return join(this.directory, createHash("sha256").update(fingerprint).digest("hex"));
  }

  #read(directory, filename, fingerprint) {
    const path = join(directory, filename);
    if (!existsSync(path)) return null;
    const record = JSON.parse(readFileSync(path, "utf8"));
    if (!record || record.fingerprint !== fingerprint) throw new Error("journal_fingerprint_mismatch");
    return record;
  }

  status(fingerprint) {
    const directory = this.#path(fingerprint);
    if (!existsSync(directory)) return "new";
    const intent = this.#read(directory, "intent.json", fingerprint);
    const dispatch = this.#read(directory, "dispatch.json", fingerprint);
    const ack = this.#read(directory, "ack.json", fingerprint);
    const resolution = this.#read(directory, "resolution.json", fingerprint);
    if (intent && intent.kind !== "effect_intent") throw new Error("invalid_intent");
    if (dispatch && (!intent || dispatch.kind !== "dispatch_boundary")) throw new Error("invalid_dispatch");
    if (ack && (!dispatch || ack.kind !== "response_observed" || !Number.isInteger(ack.httpStatus) || ack.httpStatus < 100 || ack.httpStatus > 599)) throw new Error("invalid_ack");
    if (!resolution) return "ambiguous";
    if (!dispatch) throw new Error("journal_resolution_without_dispatch");
    if (resolution.kind === "effect_commit") return "committed";
    if (resolution.kind === "effect_reject") return "rejected";
    throw new Error("invalid_resolution");
  }

  recordIntent(fingerprint) {
    const directory = this.#path(fingerprint);
    try { mkdirSync(directory, { mode: 0o700 }); }
    catch (error) { if (error.code === "EEXIST") throw new Error("intent_not_new"); throw error; }
    syncDirectory(this.directory);
    createRecord(directory, "intent.json", { kind: "effect_intent", fingerprint });
  }

  recordDispatch(fingerprint) {
    const directory = this.#path(fingerprint);
    if (this.status(fingerprint) !== "ambiguous" ||
        this.#read(directory, "intent.json", fingerprint)?.kind !== "effect_intent") throw new Error("dispatch_without_intent");
    createRecord(directory, "dispatch.json", { kind: "dispatch_boundary", fingerprint });
  }

  recordAcknowledgement(fingerprint, httpStatus) {
    if (!Number.isInteger(httpStatus) || httpStatus < 100 || httpStatus > 599) throw new Error("invalid_http_status");
    const directory = this.#path(fingerprint);
    if (this.status(fingerprint) !== "ambiguous" || !this.wasDispatched(fingerprint)) throw new Error("ack_without_dispatch");
    createRecord(directory, "ack.json", { kind: "response_observed", fingerprint, httpStatus });
  }

  wasDispatched(fingerprint) {
    return this.#read(this.#path(fingerprint), "dispatch.json", fingerprint)?.kind === "dispatch_boundary";
  }

  #resolve(fingerprint, kind) {
    if (this.status(fingerprint) !== "ambiguous" || !this.wasDispatched(fingerprint)) throw new Error("resolution_without_dispatch");
    createRecord(this.#path(fingerprint), "resolution.json", { kind, fingerprint });
  }

  recordCommit(fingerprint) { this.#resolve(fingerprint, "effect_commit"); }
  recordReject(fingerprint) { this.#resolve(fingerprint, "effect_reject"); }

  entries(fingerprint) {
    const directory = this.#path(fingerprint);
    if (!existsSync(directory)) return [];
    return files.map(name => this.#read(directory, name, fingerprint)).filter(Boolean);
  }
}
