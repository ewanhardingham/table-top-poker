# 0005 — Players release their own seat via a token-authenticated leave endpoint

## Status

Accepted. Complements [ADR-0003](0003-eviction-is-a-manual-table-action.md):
the table's manual evict frees *someone else's* seat; this adds a player
freeing *their own*. Neither revives the automatic eviction ADR-0003 removed.

## Context

A player could sit out (skip hands while keeping their seat) but had no way
to give the seat up — only the table device could free it, via the manual
evict action (ADR-0003). "I'm done, take my seat back" had to be done by
someone else at the table.

Two constraints shaped the mechanism:

- **It must work while disconnected.** The most common reason to want out is
  a flaky or dead connection, which is precisely when a WebSocket command
  (the transport `sitOut`/`sitIn` use) cannot be sent. A leave that only
  works while connected would fail in the case that motivates it most.
- **It must not reintroduce an automatic timer.** ADR-0003 deliberately
  removed auto-eviction so the human at the table — not a clock — decides
  when a disconnected player is *gone* versus merely *away*. Cleaning up a
  ghost seat left by a leave that never reached the server is still that
  human's job, via manual evict; nothing here changes that.

## Decision

Leaving is a player-initiated seat release exposed as
`POST /rooms/:code/seats/:seatId/leave`, authenticated by the seat's own
token (the same token the client stores for silent reclaim). It reuses the
existing free-the-seat operation wholesale — the one manual evict already
uses — so a live in-hand seat is folded first exactly as an eviction is:
the current actor folds normally, a non-actor is removed from the
outstanding queue without disturbing whoever is to act. Committed chips
stay in the pot. The seat's token is invalidated, the claim cleared, and
the freed seat broadcast to the table.

HTTP rather than a WebSocket command specifically so it works with no live
socket; the client sends it with a keep-alive fetch so it survives the
client's own teardown, and tears down optimistically — clearing its seat,
room, and stored token and returning to the join screen without waiting for
a reply. The leaving socket is closed server-side without the
`player-evicted` notice, since a voluntary leave is not an eviction and the
client has already navigated away.

No timeout, counter, or automatic trigger is added. A leave that never
reaches the server (the device is fully offline) leaves the seat marked
disconnected, cleaned up by the table's manual evict — the ADR-0003 status
quo, unchanged.

## Consequences

- One free-the-seat operation now has two entry points: the table's evict
  (frees any seat, no token) and the player's leave (frees only the seat
  whose token is presented). Both fold a live hand identically.
- Leave is reachable while disconnected; the client offers it
  unconditionally, unlike `sitOut`/`sitIn`, which stay gated on a live
  socket because they have nothing to send over otherwise.
- The residual ghost seat (offline leave) is not new scope — it is the same
  disconnected-seat cleanup ADR-0003 already assigns to the table operator.
- Should automatic cleanup of disconnected seats ever be wanted, it remains
  a separate decision that must supersede ADR-0003 on its own terms, not a
  side effect of this endpoint.
