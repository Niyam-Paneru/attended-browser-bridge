# Attended Browser Bridge

You click **Submit**. The page freezes. Did the request go through?

If you click again and it *did* go through, congratulations: you've discovered duplicates.

I built this JavaScript control core for that awkward gap between **"we tried"** and **"we know what happened."** It's the decision-making part of attended browser writes, not the browser driver.

![Browser-write lifecycle: check permission and freshness, reserve intent, attempt once, then either commit confirmed results or stop when the outcome is unknown](docs/one-write.svg)

## What the picture leaves out

The permission grant must cover the **origin and action** and still be valid. The page snapshot must also match the expected origin, revision, age, and digest. An already committed effect is never written a second time.

A new effect records an intent before the outside browser driver is allowed one attempt. Only a verified readback can mark that effect committed. No reliable readback? The intent remains unresolved and the retry stays blocked.

Node.js 20+, no browser session needed. [Verification steps](docs/verification.md) are kept out of this front page.

If you're reading the source, follow [`src/bridge.js`](src/bridge.js) → [`src/policy.js`](src/policy.js) → [`src/snapshot.js`](src/snapshot.js) → [`src/ledger.js`](src/ledger.js). The tests cover grants, snapshot freshness, effect fingerprints, and replay decisions. There's a more detailed [write-state table](docs/write-state-table.md) and a [timeout walkthrough](docs/walkthrough.md).

## Not a magic browser

This repository doesn't click websites. No Chrome transport, cookies, session secrets, or Kaggle connection are included. The caller still has to integrate the real browser, perform at most the permitted write, and check the external result.

I prefer a boring "manual verification required" to a very exciting duplicate form submission. See [SECURITY.md](SECURITY.md) and [PROVENANCE.md](PROVENANCE.md) for the boundary.
