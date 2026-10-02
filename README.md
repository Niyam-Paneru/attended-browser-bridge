# Attended Browser Bridge

**This repository is the public control core of an attended browser bridge — not the browser driver itself.**

It implements the decision boundary around a browser write: authorization, snapshot freshness, canonical effect identity, intent-before-write, and replay behavior when the outcome is known or uncertain.

One rule drives the design: after a browser write, “I am not sure what happened” is a reason to stop, not a reason to click again.

## Write / effect sequence

```mermaid
sequenceDiagram
    participant Caller
    participant Core as Public control core
    participant Ledger as Effect ledger
    participant Driver as External browser driver
    Note right of Driver: outside this public repo

    Caller->>Core: prepare(request)
    Core->>Core: authorize()
    Core->>Core: assertFreshSnapshot()
    Core->>Ledger: status(fingerprint)

    alt committed
        Ledger-->>Core: committed
        Core-->>Caller: already_committed (replay blocked)
    else ambiguous
        Ledger-->>Core: ambiguous
        Core-->>Caller: manual_verification_required (replay blocked)
    else new
        Ledger-->>Core: new
        Core->>Ledger: record effect_intent
        Core-->>Caller: ready_for_single_write
        Caller->>Driver: one external write
        Driver-->>Caller: fresh readback

        alt effect verified
            Caller->>Core: commit(fingerprint)
            Core->>Ledger: record effect_commit
            Core-->>Caller: committed
        else outcome uncertain
            Caller-->>Caller: stop; intent remains ambiguous
        end
    end
```

## The write contract

A write can reach the external driver only after the public core proves two preconditions: the grant covers the origin/action and the observed snapshot is fresh.

- `authorize()` checks grant expiry, origin, and action.
- `assertFreshSnapshot()` checks origin, revision, age, and digest.
- `BrowserBridge.prepare()` fingerprints the logical effect and asks the ledger for its current state.
- A **new** effect records `effect_intent` before returning `ready_for_single_write`.
- The external driver may attempt that write once, then read back what happened.
- Verified readback can be committed. Unverified readback leaves the intent **ambiguous**, so replay stays blocked.

| Ledger state on replay | Core response | Write again? |
|---|---|---:|
| `new` | record intent → `ready_for_single_write` | once |
| `ambiguous` | `manual_verification_required` | no |
| `committed` | `already_committed` | no |

## Inspect the implementation

| Question | Implementation | Proof |
|---|---|---|
| Is this origin/action authorized now? | [`src/policy.js`](src/policy.js) | [`test/policy.test.js`](test/policy.test.js), [`test/bridge.test.js`](test/bridge.test.js) |
| Is the observation still safe to act on? | [`src/snapshot.js`](src/snapshot.js) | [`test/snapshot.test.js`](test/snapshot.test.js), [`test/bridge.test.js`](test/bridge.test.js) |
| How is one logical effect identified? | [`src/canonical.js`](src/canonical.js) | [`test/bridge.test.js`](test/bridge.test.js) |
| How do `new → ambiguous → committed` states work? | [`src/ledger.js`](src/ledger.js) | [`test/ledger.test.js`](test/ledger.test.js) |
| Where are the gates composed? | [`src/bridge.js`](src/bridge.js) | [`test/bridge.test.js`](test/bridge.test.js) |

More edge-case detail: [write-state table](docs/write-state-table.md), [invariants](docs/invariants.md), [failure modes](docs/failure-modes.md), and [timeout walkthrough](docs/walkthrough.md). Verification commands and expected checks are in [docs/verification.md](docs/verification.md).

## Scope and provenance

This public repository demonstrates the control-plane logic only. It does **not** contain a Chrome/browser transport, cookies or session access, local bridge secrets, Kaggle-specific controls, or target-site automation. It does not perform real browser actions by itself.

See [`PROVENANCE.md`](PROVENANCE.md) and [`SECURITY.md`](SECURITY.md) for the boundary in detail.
