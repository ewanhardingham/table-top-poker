# Protocol

Shared wire types, Zod schemas, and small predicates between server and clients
(`packages/protocol`).

## Single trust-boundary schema

Every value that crosses the untrusted HTTP/WS boundary has **one** schema that
is the sole definition of its valid range, parsed by both the server edge and
shared by the clients so the bounds can never drift between wire and store:

- `SeatCountSchema` (`MIN_SEAT_COUNT`=2 … `MAX_SEAT_COUNT`=8) — 2 is heads-up,
  the smallest dealable table; 8 is the physical felt limit. The count is
  per-room (the creator picks it), not a global constant. `RoomStore.create` and
  `POST /rooms` both parse through it.
- `ShotClockSettingsSchema` (5…600s) is the single trust-boundary definition for
  the action clock.
- `ClaimSeatRequestSchema` enforces the required display name (1…10 chars).

Because the range lives in the schema, an out-of-range value is a caller bug in
the store (it throws) but a 400 at the HTTP edge (it parses first).

## Room-wide settings

- **Sound** (`SoundSettings`, #182): `sounds` is the master switch; `cards`,
  `actions`, `notifications` are the three cue categories under it (cards = card
  foley: deal/board/flip; actions = fold/check; notifications = your-turn
  prompt). A cue plays only when the master *and* its category are on. Owned by
  the table and pushed to every surface on `room-view`; phones hold no local
  override and obey verbatim. The whole set is sent every write, so it stays one
  atomic update with no partial-ordering to reason about.
- **Shot clock** is queued until the next deal-in (`pendingShotClock`), so an
  edit never disturbs the active hand's timer.

## Seat state predicates

- `isDealtInNextHand` is the client mirror of the server's `eligibleSeats`
  (ADR-0002): claimed, connected, not *voluntarily* sitting out. A
  `waiting-for-next-hand` seat sets `sittingOut` on the view but *is* dealt in
  next hand, so the **reason**, not the flag, is what excludes a seat.
- `SeatView` never carries a claim token; `disconnected` is a presence-only
  badge (ticket 33 §7) that never affects folding or legal actions (ADR-0002
  gates deal-in on it, not legality).
- `isHandLive`/`isHandComplete` accept an `EngineState`, `PlayerView`,
  `TableView`, or null, so both server and client answer "is a hand live" the
  same way regardless of which shape they hold.

## Messages

`ViewSnapshotMessage` is pushed once after a socket opens when a hand is already
in progress — a snapshot only, never replayed events (Phase 1 spec #130 §7, §9).
`RoomEndedMessage` covers both manual "End session" and the table's 60s
reconnect grace elapsing; both discard in-memory state identically.
