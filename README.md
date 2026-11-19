# Attended Browser Bridge

You click **Submit**. The page freezes. Did the request go through?

If you click again and it *did* go through, congratulations: you've discovered duplicates.

I built this JavaScript control core for that awkward gap between **"we tried"** and **"we know what happened."** It's the decision-making part of attended browser writes, not the browser driver.

## The one-write rule

A write goes through these checks:

1. **Permission:** Is this action allowed for this origin, and is the grant still valid?
2. **Fresh page:** Does the snapshot still match the origin, revision, age, and digest we inspected?
3. **Effect ledger:** Is this a new action, a previous success, or an unresolved attempt?

| Ledger says | The core says |
| --- | --- |
| New action | Record intent; one external write may be attempted |
| Previous attempt, outcome unknown | Stop. Verify first. |
| Already committed | Stop. The button had its moment. |

After the external caller performs the single write, a verified readback can commit it. With no trustworthy readback, the intent stays unresolved. A timeout doesn't magically erase history.

## The two halves of a write

First, the core checks permission and reserves intent *before* the external action.

```mermaid
---
config:
  sequence:
    actorMargin: 50
    messageMargin: 28
    mirrorActors: false
    wrap: false
---
sequenceDiagram
    accTitle: Prepare and reserve the browser effect
    accDescr: Sequence for prepare and reserve the browser effect.
    participant Caller
    participant Core as Control core
    participant Ledger as Effect ledger
    Caller->>Core: prepare(request)
    Core->>Core: authorize()
    Core->>Core: assertFreshSnapshot()
    Core->>Ledger: status(fingerprint)
    alt Already committed
        Ledger-->>Core: committed
        Core-->>Caller: Already committed<br/>No second write
    else Outcome ambiguous
        Ledger-->>Core: ambiguous
        Core-->>Caller: Manual verification required<br/>No second write
    else New effect
        Ledger-->>Core: new
        Core->>Ledger: record effect_intent
        Core-->>Caller: ready_for_single_write
    end
```

Then the caller does a single write and verifies the result before recording success.

```mermaid
---
config:
  sequence:
    actorMargin: 50
    messageMargin: 28
    mirrorActors: false
    wrap: false
---
sequenceDiagram
    accTitle: Write once and verify the browser effect
    accDescr: Sequence for write once and verify the browser effect.
    participant Caller
    participant Core as Control core
    participant Ledger as Effect ledger
    participant Driver as Browser driver
    Note over Driver: External integration
    Note over Caller,Core: Start only after prepare returns<br/>ready_for_single_write
    Caller->>Driver: One external write
    Driver-->>Caller: Fresh readback
    alt Effect verified
        Caller->>Core: commit(fingerprint)
        Core->>Ledger: record effect_commit
        Core-->>Caller: committed
    else Outcome uncertain
        Note over Caller,Ledger: Stop - intent remains ambiguous
    end
```

Node.js 20+, no browser session needed. [Verification steps](docs/verification.md) are kept out of this front page.

If you're reading the source, follow [`src/bridge.js`](src/bridge.js) → [`src/policy.js`](src/policy.js) → [`src/snapshot.js`](src/snapshot.js) → [`src/ledger.js`](src/ledger.js). The tests cover grants, snapshot freshness, effect fingerprints, and replay decisions. There's a more detailed [write-state table](docs/write-state-table.md) and a [timeout walkthrough](docs/walkthrough.md).

## Not a magic browser

This repository doesn't click websites. No Chrome transport, cookies, session secrets, or Kaggle connection are included. The caller still has to integrate the real browser, perform at most the permitted write, and check the external result.

I prefer a boring "manual verification required" to a very exciting duplicate form submission. See [SECURITY.md](SECURITY.md) and [PROVENANCE.md](PROVENANCE.md) for the boundary.
