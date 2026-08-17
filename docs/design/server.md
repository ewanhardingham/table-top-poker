# Server

The Fastify HTTP/WebSocket server (`packages/server`): the `RoomStore`
in-memory aggregate, the socket fan-out, the action clock, and test-mode bots.
See `docs/adr/` (0002–0005) for the seat-lifecycle decisions this layer
enforces, and Phase 1 spec #130 for the transport contract.

## Secrecy lives in `view`, redaction guards the wire

`HandEvent` is the engine's full, unredacted truth by design; all secrecy lives
in `view` (Phase 1 spec #130 §3/§4). The wire event carried alongside a view is
a transport-level exception: `redactEventFor` strips `HoleCardsDealt` per
recipient before it leaves the server (table gets none; a seat gets only its
own), or the "raw event for audit/animation" allowance in §6 would leak every
seat's cards to every socket.

`fanOutHandUpdate` sends each socket `view(state, identity)` **only if that seat
was dealt into the hand** (`state.seats.includes(identity)`) — a sitting-out
seat's socket gets nothing, never another seat's cards. `isSeat` is the single
guard that excludes the `table`/`lobby` identities from any per-seat path, so
those never reach `view(state, seatId)` or presence tracking.

## Presence is cosmetic; the clock is connection-independent

- `markPresence`/`setSeatDisconnected` toggle a **cosmetic** badge only — never
  `rooms.dispatch`. Missed pongs (`missedPongLimit`) flip it on, a pong or
  reconnect flips it off. A reconnecting seat resumes silently with no penalty
  (§7).
- The **action clock** (`action-clock.ts`, `rescheduleActionClock`) is fully
  decoupled from socket state (§7): folding is strictly clock-driven, and only
  `dispatch` outcomes move the clock. It re-arms against the live actor after
  every accepted command (real or synthesized), and arms *before* the first
  hand-update so every live view (including `HandStarted`) carries the deadline
  and a reconnect snapshot reads the same `room.turnEndsAt`. On timeout it
  preserves a free check (reads `legalActions` at fire time), else folds.
- Timers everywhere here **re-read room state at fire time** (bot actions, clock
  timeouts): a scheduled callback may outlive an intervening human action,
  eviction, hand completion, or teardown, even after its own timer was replaced.
  A synthesized action being rejected is not expected (the actor was live at
  schedule time and any real action would have replaced the timer), but the
  recovery path re-arms rather than stalls.

## Seat lifecycle at the transport

- **Eviction** (ADR-0003) vs **leave** (ADR-0005) are twins: leave is the
  token-gated version. `closeSeatSockets` removes *currently open* sockets for a
  freed seat too (a token only protects the next connection attempt), flagging
  them so their close handler skips the disconnect toggle; a voluntary leave
  passes `notify=false` (no `player-evicted` notice). A current-actor
  evict/leave folds and reschedules the clock; a non-actor one is dispatched as
  an engine `evict` with `actionClock: "preserve"`, leaving the live actor's
  deadline untouched.
- **Seat moves** (positional repack, ADR-0004): `applySeatMoves` updates each
  open socket's transport identity to follow its moved seat before the new view
  is sent — the token stays with the player, the identity follows the seat. A
  reconnecting player may still hold the pre-repack seat in localStorage; the
  token authenticates them and the stale position only sources the `seat-moved`
  resync notice.
- **Sit-out/in** (ADR-0002) is a seat-only room-store mutation that never
  reaches the engine.
- **Room end**: `endRoom` handles both "End session" and the table's grace
  window elapsing identically — notify, close, discard transport bookkeeping,
  discard the room. Only in-memory state; hand logs on disk are untouched. The
  table socket closing arms a single `graceWindowMs` timer; a table reconnect
  clears it.

## Roles and auth

`UNAUTHENTICATED_ROLES` (`table`, `lobby`) skip seat-token auth and are kept in
one list so the unauthenticated surface is reviewable at a glance; everything
else must present a valid seat token (`authenticateSeat`). `lobby` is an
unclaimed watcher — it may receive views but is rejected from issuing commands.

## Static serving and caching

`index: false` on the static plugin leaves index resolution to the explicit `/`
and `/join/:code` routes, which serve a staged release build
(`public/table`, `public/player`, from `build:release`) or fall back to the
placeholder when unstaged (dev/tests). Both serve the HTML shell with
`cache-control: no-store`: the shell names the current fingerprinted bundle, so
a cached shell would pin a long-lived kiosk to an old build across restarts; the
hashed assets it points at stay cacheable. `PLAYER_CLIENT_ORIGIN` redirects
`/join/:code` to the player-client's dev server when set.

## Test-mode bots

Gated by `testMode`; the `/bots` route isn't even registered otherwise, so the
production surface is a plain 404. `bot-policy.ts` is pure (no engine state): it
weights the engine-supplied legal-action list (a free check/call far outweighs
fold/raise, but every legal action stays reachable) and rolls sit-out/in cadence
between hands. `rollBotSitStates` runs at `HandComplete` before `nextHand`, so
the next deal-in sees the results; it considers returning bots first and has a
recovery override so a failed roll never strands a room below two eligible
seats. RNG draws are guarded so a seat that can't act never consumes a draw
(keeping a deterministic RNG stable across the sequence). `unitRandom` clamps
injected values into `[0, 1)` without rounding a valid `MAX_UNIT_RANDOM`.

## Persistence (`packages/persistence`)

`HandLog` is an append-as-you-go JSONL logger: a seats manifest written once,
then a command/event file pair per hand. Every write is a single synchronous
`fs` call, so a killed process loses at most the one record it was mid-write on,
never a batch. The game id is validated (it becomes a directory name). Records
carry `ENGINE_LOG_VERSION` for replay/audit.
