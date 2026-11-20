// This is a deliberately narrow local fixture adapter, not the private browser driver.
import { chromium } from "playwright";
import { setTimeout as delay } from "node:timers/promises";
import { BrowserBridge } from "../src/bridge.js";
import { DurableEffectLedger } from "../src/durable-ledger.js";
import { authorize } from "../src/policy.js";
import { snapshotTicket, assertFreshSnapshot } from "../src/snapshot.js";
import { summary } from "./ticket-site.mjs";

const job = JSON.parse(process.argv[2]);
const { origin, ticketId, mode, journal, fault = "none", readbackFault = "none", crash = false } = job;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)) throw new Error("loopback_only");
const ledger = new DurableEffectLedger(journal), bridge = new BrowserBridge({ ledger });
const formUrl = `${origin}/form?mode=${mode}`;
const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage();
page.setDefaultTimeout(5000);
const result = { ticketId, pid: process.pid, browser: browser.version(), initial: null, permission: null, decision: null, network: null, relay: null, blockedRepeatedBrowserPosts: 0, readback: null, journal: [] };
let armed = false, released = false, prepared, request, snapshot;
const capture = async () => ({ url: page.url(), revision: Number(await page.locator("form").getAttribute("data-revision")),
  action: await page.locator("form").getAttribute("action"), ticketId: await page.getByLabel("Ticket ID").inputValue(), summary: await page.getByLabel("Summary").inputValue() });

function policyAtBoundary() {
  const policy = authorize({ ...request, now: Date.now() });
  if (!policy.allowed) throw new Error(policy.reason);
  assertFreshSnapshot(snapshot, { origin, minRevision: request.minRevision, now: Date.now(), maxAgeMs: request.maxSnapshotAgeMs });
}

await page.route("**/*", async route => {
  const req = route.request(), url = new URL(req.url());
  if (url.origin !== origin) { await route.abort(); return; }
  if (req.method() === "GET") { await route.continue(); return; }
  if (req.method() !== "POST" || url.pathname !== "/submit" || url.search || !armed || released) {
    if (req.method() === "POST" && released) result.blockedRepeatedBrowserPosts++;
    await route.abort(); return;
  }
  const body = new URLSearchParams(req.postData() ?? "");
  if (body.size !== 4 || body.get("ticketId") !== ticketId || body.get("summary") !== summary || body.get("mode") !== mode || body.get("revision") !== String(snapshot.revision)) {
    await route.abort(); return;
  }
  try {
    policyAtBoundary();
    ledger.recordDispatch(prepared.fingerprint); // fsynced before the browser request is released.
    policyAtBoundary(); // Disk latency must not silently extend the grant.
  } catch (error) {
    result.network = { failure: error.message }; await route.abort(); return;
  }
  released = true;
  // Chromium may retry a POST internally after an empty response (observed in testing).
  // Never release this write into its native retrying transport. Relay the actual
  // browser-initiated request once, without retry or redirects, then fulfill/abort it.
  let upstream;
  try {
    upstream = await route.fetch({ maxRetries: 0, maxRedirects: 0, timeout: 5000 });
    result.relay = { response: upstream.status() };
  } catch (error) {
    result.relay = { failure: error.name, detail: String(error.message).split("\n")[0] };
    await route.abort("failed"); return;
  }
  await route.fulfill({ response: upstream });
});

function observeNetwork() {
  return new Promise(resolve => {
    const finish = data => { clearTimeout(timer); page.off("response", response); page.off("requestfailed", failed); resolve(data); };
    const relevant = req => req.method() === "POST" && req.url() === `${origin}/submit`;
    const response = res => { if (relevant(res.request())) finish({ response: res.status() }); };
    const failed = req => { if (relevant(req)) finish({ failure: req.failure()?.errorText ?? "request_failed" }); };
    const timer = setTimeout(() => finish({ failure: "response_timeout" }), 6000);
    page.on("response", response); page.on("requestfailed", failed);
  });
}

async function reconcile() {
  const effect = prepared.fingerprint;
  if (!ledger.wasDispatched(effect)) { result.readback = { state: "no_dispatch_evidence" }; return; }
  try {
    const url = new URL(`${origin}/readback`);
    url.searchParams.set("ticketId", ticketId); url.searchParams.set("fault", readbackFault);
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(3000) });
    if (!res.ok) { result.readback = { status: res.status, state: "unavailable" }; return; }
    const { record } = await res.json();
    if (!record) { result.readback = { status: res.status, state: "not_found" }; return; }
    if (record.ticketId !== ticketId || record.summary !== summary) { result.readback = { status: res.status, state: "mismatch" }; return; }
    result.readback = { status: res.status, state: record.event, ticketId: record.ticketId, summary: record.summary };
    if (record.event === "saved") bridge.commit(effect);
    else if (record.event === "rejected") bridge.reject(effect);
  } catch (error) { result.readback = { state: "unavailable", error: error.name }; }
}

try {
  await page.goto(formUrl);
  result.initial = await capture();
  // A fixture operator issues the short-lived grant. There is no real login or customer account.
  const grant = { origins: [origin], actions: ["submit"], expiresAt: Date.now() + 30_000 };
  await page.getByLabel("Ticket ID").fill(ticketId);
  await page.getByLabel("Summary").fill(summary);
  const observed = await capture();
  snapshot = snapshotTicket({ origin, revision: observed.revision, observedAt: Date.now() });
  result.observed = observed;
  if (fault === "stale") await page.getByRole("button", { name: "Change form revision" }).click();
  if (fault === "expired") grant.expiresAt = Date.now() - 1;
  if (fault === "wrong-origin") grant.origins = ["http://127.0.0.1:1"];
  const current = await capture();
  if (fault === "expiry-at-dispatch") grant.expiresAt = Date.now() + 500;
  request = { origin, action: "submit", target: `support-ticket:${ticketId}`, value: summary, grant,
    snapshot, minRevision: current.revision, maxSnapshotAgeMs: 15_000 };
  result.current = current;
  result.permission = { allowed: authorize(request).allowed, expiresAt: grant.expiresAt, origins: grant.origins, actions: grant.actions };
  prepared = bridge.prepare(request);
  result.decision = prepared.stage;
  result.reason = prepared.reason ?? null;
  if (prepared.stage === "ready_for_single_write") {
    if (fault === "navigate") await page.goto(`${origin}/other`);
    if (fault === "stale-after-intent") await page.getByRole("button", { name: "Change form revision" }).click();
    if (fault === "expiry-at-dispatch") await delay(Math.max(0, grant.expiresAt - Date.now() + 25));
    try {
      policyAtBoundary();
      if (page.url() !== formUrl) throw new Error("unexpected_navigation");
      const final = await capture();
      if (final.revision !== snapshot.revision || final.action !== "/submit" || final.ticketId !== ticketId || final.summary !== summary) throw new Error("page_changed_after_intent");
      armed = true;
      const network = observeNetwork();
      try { await page.getByRole("button", { name: "Submit ticket", exact: true }).click({ noWaitAfter: true }); }
      catch (error) { result.clickError = error.name; }
      result.network = await network;
      armed = false;
      if (result.network.response && ledger.wasDispatched(prepared.fingerprint)) ledger.recordAcknowledgement(prepared.fingerprint, result.network.response);
    } catch (error) { result.network = { failure: error.message }; }
    if (!crash) await reconcile();
  } else if (prepared.stage === "ambiguous") { await reconcile(); }
  if (prepared.fingerprint) {
    result.final = ledger.status(prepared.fingerprint);
    result.journal = ledger.entries(prepared.fingerprint).map(({ fingerprint, ...row }) => row);
  } else result.final = "denied";
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
// Explicitly interrupt the first executor before readback; a new OS process opens the journal.
if (crash) process.exit(71);
