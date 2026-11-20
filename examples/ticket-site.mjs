import http from "node:http";
import { once } from "node:events";
import { appendFileSync, closeSync, fsyncSync, openSync, readFileSync } from "node:fs";

const modes = new Set(["ok", "reject", "drop-after", "drop-before"]);
export const summary = "Synthetic support ticket: reset notifications";

function json(res, status, data) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}

export async function startTicketSite(logPath) {
  const fd = openSync(logPath, "wx", 0o600);
  const log = (event) => { appendFileSync(fd, JSON.stringify(event) + "\n"); fsyncSync(fd); };
  const entries = () => readFileSync(logPath, "utf8").split("\n").filter(Boolean).map(JSON.parse);
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/form") {
        const mode = modes.has(url.searchParams.get("mode")) ? url.searchParams.get("mode") : "ok";
        res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "content-security-policy": "default-src 'none'; script-src 'unsafe-inline'; form-action 'self'; style-src 'unsafe-inline'" });
        res.end(`<!doctype html><html lang="en"><meta charset="utf-8"><title>Support intake | Local demo</title>
          <style>body{font:16px system-ui;max-width:550px;margin:54px auto;background:#f4f7fb;color:#14233c}main{background:white;padding:32px;border:1px solid #cbd5e1;border-radius:12px}label{display:block;margin:22px 0}input,textarea{display:block;width:95%;padding:10px;border:1px solid #9ca3af;border-radius:5px}button{padding:10px 14px;cursor:pointer}button[type=submit]{background:#1648a3;color:white;border:0;border-radius:5px}small{color:#46556b}</style>
          <main><small>ISOLATED SANDBOX · synthetic data only</small><h1>Support ticket intake</h1><p>Complete the fields, then submit one ticket.</p>
          <form method="post" action="/submit" data-revision="1">
          <label>Ticket ID<input name="ticketId" required></label><label>Summary<textarea name="summary" required></textarea></label>
          <input type="hidden" name="mode" value="${mode}"><input type="hidden" name="revision" value="1">
          <button type="submit">Submit ticket</button> <button type="button" onclick="this.form.dataset.revision='2';this.form.elements.revision.value='2'">Change form revision</button>
          </form></main></html>`);
        return;
      }
      if (req.method === "GET" && url.pathname === "/other") {
        res.writeHead(200, { "content-type": "text/html" }); res.end("<h1>Different page</h1>"); return;
      }
      if (req.method === "GET" && url.pathname === "/readback") {
        const ticketId = url.searchParams.get("ticketId");
        if (url.searchParams.get("fault") === "outage") {
          log({ event: "readback_unavailable", ticketId }); json(res, 503, { error: "unavailable" }); return;
        }
        const record = entries().find(e => e.ticketId === ticketId && ["saved", "rejected"].includes(e.event));
        log({ event: "readback", ticketId, found: Boolean(record) });
        if (url.searchParams.get("fault") === "mismatch" && record) {
          json(res, 200, { record: { ...record, summary: "wrong synthetic summary" } }); return;
        }
        json(res, 200, { record: record ?? null }); return;
      }
      if (req.method === "POST" && url.pathname === "/submit") {
        let body = "";
        for await (const chunk of req) { body += chunk; if (body.length > 4096) { res.destroy(); return; } }
        const fields = new URLSearchParams(body), ticketId = fields.get("ticketId"), value = fields.get("summary"), mode = fields.get("mode");
        log({ event: "post_received", ticketId });
        if (!/^case-[a-z-]+$/.test(ticketId ?? "") || value !== summary || !modes.has(mode) || fields.get("revision") !== "1") {
          json(res, 400, { error: "invalid_fixture_input" }); return;
        }
        if (entries().some(e => e.ticketId === ticketId && ["saved", "rejected"].includes(e.event))) {
          log({ event: "duplicate_post", ticketId }); json(res, 409, { error: "duplicate" }); return;
        }
        if (mode === "drop-before") { log({ event: "response_dropped_before_save", ticketId }); res.destroy(); return; }
        if (mode === "reject") { log({ event: "rejected", ticketId, summary: value }); json(res, 422, { error: "fixture_rejection" }); return; }
        log({ event: "saved", ticketId, summary: value });
        if (mode === "drop-after") { log({ event: "response_dropped_after_save", ticketId }); res.destroy(); return; }
        json(res, 201, { received: true, ticketId }); return;
      }
      json(res, 404, { error: "not_found" });
    } catch { res.destroy(); }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return { origin: `http://127.0.0.1:${server.address().port}`, entries,
    async close() { server.closeAllConnections(); server.close(); await once(server, "close"); closeSync(fd); } };
}
