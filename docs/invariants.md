# Invariants

1. **Every write is covered by a live grant.**
2. **Every write is based on a fresh observation of the target state.**
3. **One canonical effect gets one intent.**
4. **Committed effects are not replayed.**
5. **Ambiguous effects are not replayed.**
6. **Origin is part of authorization, not just navigation context.**
7. **Readback determines whether the effect can be committed.**

The second click is never a recovery plan.
