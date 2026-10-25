# Implemented: built-in sentiment model plus bounded supporting-model pool

Originally deferred, then implemented as a **pool** (not a single successor):
old and new supporting models coexist. See `server/SENTIMENT_SUPPORTING_POOL.md`.

- Built-in models remain immutable and primary; registry pointers cannot replace them.
- Up to three supporting models enabled (admin-configurable 1–3), each versioned and independently deletable.
- Language-aware routing only inside validation-verified uncertainty regions.
- Full-pool evaluation gates: agreement required, disagreement abstains (no majority vote).
- Enable/disable/archive/restore/delete lifecycle; disabling a model also disables dependent combinations.
- Every analysis records provenance: built-in, supporting version IDs, or unresolved cascade.

Design cautions retained: raw scores are not calibrated certainty; confidently
wrong primary predictions may not reach a fallback; unresolved disagreements
remain unclear rather than forcing a label. This cannot guarantee correct results.
