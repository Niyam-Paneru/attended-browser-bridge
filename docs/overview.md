# Design overview

The private Browser Bridge controls an attended browser. This public repository isolates the parts that decide whether a write is safe to attempt.

The bridge is built around four ideas:

1. **permission is explicit and expires;**
2. **a browser write gets one effect intent;**
3. **an unresolved effect is ambiguous, not retryable;**
4. **writes should be based on a fresh observation of the target state.**

That fourth point matters because browser UIs move. A button found on snapshot 12 may not be the same thing by snapshot 15.

The public module therefore has separate pieces for policy, canonical request identity, effect ledger, snapshot freshness, and the bridge orchestration itself.
