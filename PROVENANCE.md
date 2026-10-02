# Provenance

This is the public control core extracted from private attended-browser work.

What remains public is the part that can be reviewed without exposing a real browser session: expiring authorization, canonical effect identity, fresh-snapshot checks, intent-before-write, committed effects, and ambiguous-effect replay blocking.

The actual browser transport, cookies/session access, local bridge secrets, Kaggle-specific controls, recovery plumbing, and target-site automation are not in this repository.

So the code can answer **whether a write is safe to attempt or repeat**. It cannot perform a browser action by itself.
