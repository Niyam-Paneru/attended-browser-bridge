# Why the browser write is relayed, not continued

During the real Chromium acceptance run, the first three scenarios passed; the lost-response scenario failed. The adapter recorded one dispatch boundary, but Chromium's native network transport retried after the server destroyed the connection. The server persisted the ticket once and rejected the repeat with 409. A policy-level reservation alone did not prevent that extra POST.

Observed targeted reproduction on Linux, Chromium 151.0.7922.34, source revision `6ef1e4b9f7902fc450c5d509437e20e7b2dd886a`:

```json
{
  "browser_response": 409,
  "executor_final": "ambiguous",
  "server_events": [
    "post_received", "saved", "response_dropped_after_save",
    "post_received", "duplicate_post"
  ]
}
```

The fix changes the fixture adapter's dispatch boundary: a native Chromium form click still creates the actual browser request; Playwright's route intercept relays that exact request through `route.fetch` with `maxRetries: 0` and `maxRedirects: 0`, then fulfills the browser response or aborts the route on actual upstream failure. The browser never gets authority to independently send the write. A repeated browser request is blocked at the interceptor. The server-side duplicate guard remains defense in depth, not the proof of one dispatch.

The acceptance runner requires both a real relay failure and a failed browser request for the lost-response cases, and counts the server's actual received POSTs. A simulated click or just a logged intent cannot satisfy those assertions. This proves the controlled fixture adapter, not arbitrary browser networking or a real customer integration.
