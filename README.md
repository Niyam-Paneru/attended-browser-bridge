# Attended Browser Bridge

**This repository is the public control core of an attended browser bridge — not the full browser driver.**

It implements the decision boundary around a browser write: authorization, snapshot freshness, canonical effect identity, intent-before-write, and replay behavior when the outcome is known or uncertain. Browser transport, session access, site-specific controls, and readback plumbing are intentionally absent.

```bash
npm test
```

![Effect-state write sequence](docs/workflow.svg)

## The write contract

A write is allowed to reach the external driver only after the public core can prove two preconditions: the grant covers the origin/action and the observed snapshot is fresh.

1. `authorize()` checks grant expiry, origin, and action.
2. `assertFreshSnapshot()` checks origin, revision, age, and digest.
3. `BrowserBridge.prepare()` fingerprints the effect and asks the ledger for its state.
4. A **new** effect records `effect_intent` before returning `ready_for_single_write`.
5. The external driver may attempt that write once and then read back the result. That driver is not included here.
6. If the caller can verify the effect, it calls `commit(fingerprint)`. If it cannot, it does nothing: the intent-only state remains **ambiguous** and replay is blocked.

| Ledger state on replay | Core response | Write again? |
|---|---|---:|
| `new` | record intent → `ready_for_single_write` | once |
| `ambiguous` | `manual_verification_required` | no |
| `committed` | `already_committed` | no |

The important failure mode is the middle row: uncertainty after a side effect is a state to resolve, not permission to repeat the side effect.

## Inspect the implementation

| Question | Implementation | Proof |
|---|---|---|
| Is this origin/action authorized now? | [`src/policy.js`](src/policy.js) | [`test/policy.test.js`](test/policy.test.js), [`test/bridge.test.js`](test/bridge.test.js) |
| Is the observation still safe to act on? | [`src/snapshot.js`](src/snapshot.js) | [`test/snapshot.test.js`](test/snapshot.test.js), [`test/bridge.test.js`](test/bridge.test.js) |
| How is one logical effect identified? | [`src/canonical.js`](src/canonical.js) | [`test/bridge.test.js`](test/bridge.test.js) |
| How do `new → ambiguous → committed` states work? | [`src/ledger.js`](src/ledger.js) | [`test/ledger.test.js`](test/ledger.test.js) |
| Where are the gates composed? | [`src/bridge.js`](src/bridge.js) | [`test/bridge.test.js`](test/bridge.test.js) |

More edge-case detail: [write-state table](docs/write-state-table.md), [invariants](docs/invariants.md), [failure modes](docs/failure-modes.md), and [timeout walkthrough](docs/walkthrough.md).

## Scope and provenance

This public repository demonstrates the control-plane logic only. It does **not** contain a Chrome/browser transport, cookies or session access, local bridge secrets, Kaggle-specific controls, or target-site automation. It does not perform real browser actions by itself.

See [`PROVENANCE.md`](PROVENANCE.md) and [`SECURITY.md`](SECURITY.md) for the boundary in detail.
