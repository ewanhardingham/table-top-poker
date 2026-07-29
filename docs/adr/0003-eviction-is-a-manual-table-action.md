# 0003 — Seat eviction is a manual table action, not automatic on missed hands

## Status

Accepted. Supersedes the eviction *trigger* in [ADR-0002](0002-seat-eviction-clocks-on-missed-hands.md)
(its "Eviction" section and the associated "hand-count vs. wall-clock" and
"N = 3" decisions). ADR-0002's other decisions — sitting-out as an explicit,
player-toggled state exempt from eviction, and disconnected seats being
skipped from deal-in from the next hand onward — stand unchanged.

## Context

ADR-0002 had a disconnected seat evict itself automatically once its
missed-hands counter reached a fixed threshold (N = 3). Building it
surfaced a real usability problem: the app has no in-progress way for a
table operator to see *why* a seat is still occupied versus free, and an
automatic timer removes the one person actually at the table — the
host — from a decision that's theirs to make (a player who's stepped away
to answer the door is not the same situation as one who's genuinely gone).

## Decision

Eviction is now a manual action the table device takes on any claimed
seat — active, sitting-out, or disconnected alike — via "click a seat,
select Evict." There is no automatic threshold and no missed-hands
counter; the disconnected badge (§7) is the only signal, and the human at
the table decides when it's been long enough.

Mechanically this reuses the same free-the-seat operation ADR-0002 already
had for eviction: invalidate the seat's token, clear its claim, and
broadcast the freed seat to the table — now exposed as
`POST /rooms/:code/seats/:seatId/evict` (renamed from the prior,
UI-unwired `/clear` admin route) rather than fired by `dispatch`.

Disconnected seats are still skipped from deal-in from the next hand
onward — that part of ADR-0002 wasn't the problem and stays as-is. Only
the automatic *eviction* is gone; a disconnected seat now stays occupied
(sitting out every hand) until either it reconnects or the table evicts it.

## Consequences

- `missedHands` and the `EVICTION_THRESHOLD` constant are removed —
  nothing tracks how long a seat has been disconnected. If a table
  operator wants that surfaced later (e.g. "missed 4 hands" on the seat
  pod), that's new scope, not a revival of the old counter.
- `dispatch`'s `nextHand` branch no longer needs to report evictions —
  the only thing that can free a seat now is the explicit evict action,
  which happens outside `dispatch` entirely.
- The table client needs a seat-click affordance it didn't have before;
  this ADR doesn't specify its visual design, only that the action exists
  and is scoped to the table device (never available to a player's own
  client).
