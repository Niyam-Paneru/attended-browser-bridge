# Verification

Run from the repository root with Node.js 20 or newer, matching the repository engine requirement.

```bash
npm test
```

The Node test suite checks the public control contract around:

- grant expiry plus origin/action authorization;
- snapshot digest, revision, origin, age, and clock validation;
- canonical effect fingerprints;
- `new → ambiguous → committed` ledger behavior;
- stale/invalid observations being blocked before intent is recorded;
- unresolved intents blocking replay;
- committed effects returning `already_committed` instead of writing again.

A passing test suite verifies the public decision/ledger core only. It does not exercise a real browser transport, because that transport is intentionally outside this repository.
