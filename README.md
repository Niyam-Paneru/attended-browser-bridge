# Attended Browser Bridge

A browser agent clicks **Submit**. The page freezes. The server might have received the request; the agent hasn't got a clue.

The tempting fix is to click again. That's how one application becomes two, and your retry strategy introduces itself to the hiring manager.

I built this JavaScript **write-control core** for the awkward moment *after* a click: what was allowed, what may have happened, and what we can actually prove. It's not a Chrome driver.

## The least glamorous part of clicking a button

| Situation | Decision | Why |
| --- | --- | --- |
| Wrong origin/action, expired grant, or stale page snapshot | **Stop** | Permission for one page isn't permission for its surprise replacement. |
| Already-confirmed effect | **Block duplicate** | Once is quite enough. |
| Write was attempted but the result is unknown | **Leave unresolved; block retry** | The page freezing isn't proof the server did nothing. |
| Fresh grant and snapshot, no prior effect | **Record intent; allow one attempt** | The intention exists before the external write. |
| External result independently verified | **Commit that effect** | A readback is stronger than a success message. |

An effect fingerprint and journal distinguish a new request from a duplicate or uncertain prior attempt. A successful authorization check does **not** erase an unresolved write.

## Where the boundaries live

Start with [bridge.js](src/bridge.js), then [policy.js](src/policy.js), [snapshot.js](src/snapshot.js), and [ledger.js](src/ledger.js). The code requires the grant's origin and action to match; page freshness checks include revision, age, and digest.

Node.js 20+; no browser session required to exercise the core. The [verification steps](docs/verification.md), [write-state table](docs/write-state-table.md), and [timeout walkthrough](docs/walkthrough.md) cover permitted writes and blocked replays.

## What this repo cannot do

It cannot click a website, inspect real Chrome cookies, or prove that an external server completed an action. There's no Chrome transport, Kaggle connection, session credential, or deployment in this public repository. A caller must supply the browser integration and a trustworthy external readback.

If the caller can't establish what happened, the correct output is **manual verification required**. The next click can wait until we know what the first one did. [Security boundary](SECURITY.md) · [provenance](PROVENANCE.md).
