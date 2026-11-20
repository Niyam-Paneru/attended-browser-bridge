import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startTicketSite } from "./ticket-site.mjs";

const work = await mkdtemp(join(tmpdir(), "attended-browser-proof-"));
const site = await startTicketSite(join(work, "server.jsonl"));
const worker = fileURLToPath(new URL("./browser-worker.mjs", import.meta.url));
const scenarios = [];
const executions = [];
const stats = ticketId => {
  const events = site.entries().filter(event => event.ticketId === ticketId);
  return { requests: events.filter(e => e.event === "post_received").length, stored: events.filter(e => e.event === "saved").length,
    rejected: events.filter(e => e.event === "rejected").length, duplicatePosts: events.filter(e => e.event === "duplicate_post").length, events };
};
async function execute(name, options = {}) {
  const ticketId = `case-${name}`;
  const job = { origin: site.origin, ticketId, journal: join(work, "journal"), mode: "ok", ...options };
  const initialServer = stats(ticketId);
  const child = spawn(process.execPath, [worker, JSON.stringify(job)], { stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
  child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill(); reject(new Error(`worker timed out: ${name}`)); }, 25_000);
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => { clearTimeout(timer); resolve(code); });
  });
  assert.equal(code, options.crash ? 71 : 0, stderr || stdout);
  const execution = JSON.parse(stdout.trim());
  assert.equal(execution.pid, child.pid);
  assert.ok(execution.browser, "actual Chromium must launch");
  assert.deepEqual([execution.initial.ticketId, execution.initial.summary], ["", ""]);
  assert.equal(execution.initial.revision, 1);
  assert.equal(execution.observed.ticketId, ticketId);
  executions.push({ ...execution, exitCode: code, initialServer, finalServer: stats(ticketId) });
  return execution;
}
function pass(name, detail) { scenarios.push({ scenario: name, result: "PASS", ...detail }); console.log(`PASS ${name}: ${detail.explanation}`); }
function counts(name, requests, stored, rejected = 0) {
  const observed = stats(`case-${name}`);
  assert.deepEqual([observed.requests, observed.stored, observed.rejected, observed.duplicatePosts], [requests, stored, rejected, 0]);
  return { requests, stored, rejected };
}
function phases(run) { return run.journal.map(e => e.kind); }
try {
  const normal = await execute("normal");
  assert.equal(normal.decision, "ready_for_single_write"); assert.equal(normal.network.response, 201);
  assert.equal(normal.readback.state, "saved"); assert.equal(normal.final, "committed");
  assert.deepEqual(phases(normal), ["effect_intent", "dispatch_boundary", "response_observed", "effect_commit"]);
  const duplicate = await execute("normal");
  assert.equal(duplicate.decision, "already_committed"); assert.equal(duplicate.network, null);
  pass("confirmed + duplicate restart", { ...counts("normal", 1, 1), explanation: "201, matching readback, new process blocks duplicate" });

  const failed = await execute("rejected", { mode: "reject" });
  assert.equal(failed.network.response, 422); assert.equal(failed.readback.state, "rejected"); assert.equal(failed.final, "rejected");
  const rejectedDuplicate = await execute("rejected", { mode: "reject" });
  assert.equal(rejectedDuplicate.decision, "already_rejected"); assert.equal(rejectedDuplicate.network, null);
  pass("explicit rejection", { ...counts("rejected", 1, 0, 1), explanation: "422 and matching explicit rejection, no retry" });

  const ackOnly = await execute("ack-only", { readbackFault: "outage" });
  assert.equal(ackOnly.network.response, 201); assert.equal(ackOnly.readback.status, 503); assert.equal(ackOnly.final, "ambiguous");
  assert.deepEqual(phases(ackOnly), ["effect_intent", "dispatch_boundary", "response_observed"]);
  const ackRecovery = await execute("ack-only");
  assert.equal(ackRecovery.decision, "ambiguous"); assert.equal(ackRecovery.network, null); assert.equal(ackRecovery.final, "committed");
  pass("acknowledged but not confirmed", { ...counts("ack-only", 1, 1), explanation: "201 plus failed readback is unresolved; restart verifies, never submits" });

  const lost = await execute("lost", { mode: "drop-after", crash: true });
  assert.ok(lost.network.failure); assert.equal(lost.network.response, undefined); assert.equal(lost.readback, null); assert.equal(lost.final, "ambiguous");
  assert.ok(lost.relay.failure, "the real one-shot upstream request must fail");
  assert.deepEqual(phases(lost), ["effect_intent", "dispatch_boundary"]);
  assert.ok(stats("case-lost").events.some(e => e.event === "response_dropped_after_save"));
  pass("lost response + interrupted process", { ...counts("lost", 1, 1), explanation: "Chromium reports failure; durable server record exists; executor exits 71 before readback" });
  const outage = await execute("lost", { mode: "drop-after", readbackFault: "outage" });
  assert.notEqual(outage.pid, lost.pid); assert.equal(outage.decision, "ambiguous"); assert.equal(outage.readback.status, 503); assert.equal(outage.final, "ambiguous"); assert.equal(outage.network, null);
  pass("restart during readback outage", { ...counts("lost", 1, 1), explanation: "new PID, 503, no POST, still unresolved" });
  const mismatch = await execute("lost", { mode: "drop-after", readbackFault: "mismatch" });
  assert.equal(mismatch.readback.state, "mismatch"); assert.equal(mismatch.final, "ambiguous");
  pass("wrong-record readback", { ...counts("lost", 1, 1), explanation: "200 with wrong business payload does not establish success" });
  const recovered = await execute("lost", { mode: "drop-after" });
  assert.equal(recovered.decision, "ambiguous"); assert.equal(recovered.network, null); assert.equal(recovered.readback.state, "saved"); assert.equal(recovered.final, "committed");
  const recoveredReplay = await execute("lost", { mode: "drop-after" });
  assert.equal(recoveredReplay.decision, "already_committed");
  pass("reconcile without retry", { ...counts("lost", 1, 1), explanation: "matching readback confirms existing effect; another restart still blocks replay" });

  const absent = await execute("unknown", { mode: "drop-before" });
  assert.ok(absent.network.failure); assert.equal(absent.readback.state, "not_found"); assert.equal(absent.final, "ambiguous");
  assert.ok(absent.relay.failure);
  const absentReplay = await execute("unknown", { mode: "drop-before" });
  assert.equal(absentReplay.decision, "ambiguous"); assert.equal(absentReplay.final, "ambiguous"); assert.equal(absentReplay.network, null);
  pass("transport failure + absent record", { ...counts("unknown", 1, 0), explanation: "negative lookup stays unresolved; restart does not replay" });

  for (const [name, fault, reason, stage] of [["stale", "stale", "snapshot_revision_stale", "snapshot"], ["expired", "expired", "grant_expired", "policy"], ["wrong-origin", "wrong-origin", "origin_not_allowed", "policy"]]) {
    const run = await execute(name, { fault });
    assert.equal(run.decision, stage); assert.equal(run.reason, reason); assert.equal(run.final, "denied"); assert.deepEqual(run.journal, []);
    pass(name, { ...counts(name, 0, 0), explanation: `${reason}; no intent or POST` });
  }
  for (const [name, fault, reason] of [["navigate", "navigate", "unexpected_navigation"], ["late-expiry", "expiry-at-dispatch", "grant_expired"], ["late-stale", "stale-after-intent", "page_changed_after_intent"]]) {
    const run = await execute(name, { fault });
    assert.equal(run.decision, "ready_for_single_write"); assert.equal(run.network.failure, reason); assert.deepEqual(phases(run), ["effect_intent"]); assert.equal(run.final, "ambiguous");
    const retry = await execute(name);
    assert.equal(retry.decision, "ambiguous"); assert.equal(retry.readback.state, "no_dispatch_evidence");
    pass(name, { ...counts(name, 0, 0), explanation: `${reason} after intent; held for review even after restart` });
  }
  const all = site.entries();
  assert.equal(all.filter(x => x.event === "post_received").length, 5);
  assert.equal(all.filter(x => x.event === "saved").length, 3);
  assert.equal(all.filter(x => x.event === "rejected").length, 1);
  const evidence = { verifiedAt: new Date().toISOString(), node: process.version, platform: `${process.platform}/${process.arch}`, chromium: executions[0].browser,
    driver: "Playwright / real Chromium, new process per execution", target: "isolated 127.0.0.1 synthetic ticket application", scenarios, executions,
    totals: { scenarios: scenarios.length, executorProcesses: executions.length, receivedPosts: 5, savedTickets: 3, explicitRejections: 1, duplicatePosts: 0, result: "PASS" } };
  if (process.argv[2]) await writeFile(process.argv[2], JSON.stringify(evidence, null, 2) + "\n");
  console.log(JSON.stringify(evidence.totals));
} finally { await site.close(); await rm(work, { recursive: true, force: true }); }
