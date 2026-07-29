# 0002 — Seat eviction clocks on consecutive missed hands, not wall-clock time; sitting-out is an explicit state

## Status

Accepted

## Context

`docs/phase-1-spec.md` §7 (from issue #13) covers disconnect detection and
the cosmetic "disconnected" badge, but leaves no path to free a seat that
never reconnects — it stays occupied, dealt in, clock-timed-out, and folded
every hand, indefinitely. Issue #56 proposed closing that gap with a fourth
seat state (eviction after N consecutive missed hands) and splitting
voluntary sit-out from disconnection, leaving three open questions:
hand-count vs. wall-clock as the eviction timer, whether N is a room
setting or a fixed constant, and whether an evicted seat's in-progress hand
needs special handling.

## Decision

**Sitting-out** becomes an explicit, player-toggled seat state, independent
of connection status. A sitting-out seat is never dealt in and **never
accrues eviction risk**, even if it's also disconnected for the entire
duration.

**Disconnected** seats keep the existing §7 behaviour unchanged: a hand
already in progress still times out and folds via the action clock, never
the socket. From the *next* hand onward while still disconnected, the seat
is skipped like a sit-out (no wasted deals or timeouts), and a per-seat
"hands missed" counter increments once per skipped hand.

**Eviction** fires when that counter reaches **N = 3 consecutive missed
hands**, fixed as a constant for Phase 1, not a room-level setting — no
other room-level config exists yet (§7's room lifecycle has none), and
introducing one just for this is premature until a real table proves 3
wrong. On eviction: the seat's token is invalidated server-side, the seat
is freed back into the join picker, and the eviction is broadcast to the
table.

The counter is **hand-count**, not wall-clock: deterministic, replayable
from the JSONL hand log the same way the rest of hand state is (§5), and
needs no timer running against room state between hands.

Reconnecting at any point while disconnected resets the counter to 0 and
returns the seat to active for the next hand.

## Consequences

- Eviction can only fire on the boundary between hands, after a skipped
  hand's counter increments — never while a seat is mid-hand. The issue's
  third open question (does an evicted seat's in-progress hand need special
  handling) resolves to: not reachable, by construction. No such handling
  is needed.
- New per-seat state: a voluntary sitting-out flag and an involuntary
  missed-hand counter, both independent of the existing §7 disconnected
  presence signal.
- N = 3 ships as a constant. Making it configurable later is a small,
  reversible follow-up if a real table proves it wrong — not blocking this
  decision.
