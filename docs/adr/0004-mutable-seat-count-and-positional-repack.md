# 0004 — Changing a room's seat count repacks positions between hands

## Status

Accepted.

## Context

Issue #77 adds the table device's first room setting: the number of seats may
change after a Room has been created. A table may have started with eight
places even though only four people arrived, or players may leave while a
session is running.

Seat ids have historically behaved like identity. They are used by the
engine's deal-in ring and Button, claim tokens are attached to them, and both
clients display them. A smaller table cannot simply discard seats above the
new limit when claimed players are spread across the ring: doing so would
evict players and would leave the positional engine state inconsistent.

## Decision

1. **Changing the setting never evicts anyone.** Manual eviction remains the
   deliberate table action defined by ADR-0003.

2. **The lower bound is room state:**
   `max(MIN_SEAT_COUNT, claimedSeats)`. A claimed seat counts toward the floor
   whether its player is connected, disconnected, or sitting out. Requests
   below this floor are rejected.

3. **A shrink repacks claimed players into the surviving positions.** Claimed
   seats are taken in ascending positional order and assigned ids `0..n-1`.
   The player's claim token, sitting-out state, and disconnected state move
   with them. Seat id is therefore a mutable position, not a permanent player
   identity. Affected open player sockets receive a `seat-moved` message, and
   the player persists the new positional seat alongside their claim token for
   reconnect.

4. **A shrink never changes a live hand's positions.** A request made while
   `hand.status === "betting"` is queued and applied at the next successful
   deal-in recompute, after that hand's fixed ring and Button are no longer
   live. A request between hands repacks immediately; the next `nextHand`
   recompute then gives the engine the new positional state. When a completed
   hand is displayed, its positional references are remapped with the same
   move so the felt and reconnect snapshots remain aligned. Growing is safe
   immediately because it only appends empty positions; new claimed seats join
   the next deal-in under ADR-0002.

The table client presents this as a modal “House rules” sheet. It shows the
floor, previews positional moves, and labels a queued shrink as applying from
the next hand. The player client surfaces a move explicitly and updates its
persisted token record to the new position.

## Consequences

- `Room.seats` is no longer a fixed-length collection, and a `Room` carries a
  pending shrink while a hand is live.
- Claim tokens remain the durable player credential across a repack; seat ids
  must not be used as player identity outside the current positional state.
- The room view can report a pending seat count so both clients render the
  table's queued setting consistently.
- The engine still receives a fixed seat ring for each hand. No live hand is
  renumbered, so deal order, blinds, and the Button remain coherent.
