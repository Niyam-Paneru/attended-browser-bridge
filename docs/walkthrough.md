# Walkthrough: the dangerous timeout

Suppose an attended browser is showing a **Run** control.

The bridge has:

- a live grant for this origin and action;
- a fresh snapshot that identifies the target;
- no prior effect record for this canonical request.

Before the click, the ledger records **intent**.

The write happens once.

Now imagine the transport times out before readback.

There are two possibilities:

1. the click never landed;
2. the click landed and the response was lost.

Those possibilities look identical from the transport.

The unsafe reaction is to click again.

The bridge instead leaves the effect **ambiguous** and requires fresh observation. If the new state proves the action already happened, the effect can be committed. If not, a human can decide what recovery is safe.

The interesting feature is not clicking. It is knowing when a second click is unjustified.
