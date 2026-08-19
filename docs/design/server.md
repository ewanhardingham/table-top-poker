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
  every committed command (real or synthesized) and *before* the first
  hand-update, so every live view (including `HandStarted`) carries the deadline
  and a reconnect snapshot reads the same `room.turnEndsAt`. Arming after the
  commit is what keeps append latency out of a player's thinking time. On
  timeout it preserves a free check (reads `legalActions` at fire time), else
  folds.
- `"preserve"` (a non-actor eviction) keeps the actor's existing deadline rather
  than granting a fresh interval, but still re-arms the timer so it carries the
  revision that eviction produced — see the commit seam below.
- Timers everywhere here **re-read room state at fire time** (bot actions, clock
  timeouts): a scheduled callback may outlive an intervening human action,
  eviction, hand completion, or teardown, even after its own timer was replaced.
  A synthesized action being rejected is not expected, but the recovery path
  re-arms rather than stalls.

## The commit seam and the Room operation queue

Nothing is broadcast before it is recorded (Phase 2 spec #129 §3, issue #118).

- `RoomStore.dispatch` is **pure and synchronous**: it decides the Command
  against the Room and returns a `DispatchTransaction` — the staged steps plus
  the `RoomOperation` the recording takes — having changed nothing. The engine
  reassignment, the pending seat shrink, the `pendingSeatCount` clear, the
  `waitingForNextHand` recompute, the pending shot-clock take-up and an evicted
  seat's release all happen in `commit()`, not before the outcome is known.
  That ordering is what retires the class of bug #95 was an instance of, where a
  rejected `nextHand` had already rewritten the live hand's seats and button.
  Settling a transaction twice throws: the obligation rides on the handle rather
  than on a convention a later edit can drop.
- `app.ts` sequences it — `append` → `commit()` (or `discard()` on failure) →
  broadcast — in `publishDispatch`, which answers whether the operation was
  published. A refused append is dropped and logged, and it **cancels the
  Actor's clock**: the timer that fired is spent, and nothing may act on an
  unrecorded Room. Eviction and leave hang on that answer too — a seat whose
  fold could not be recorded is still holding its hand, so it is not taken from
  its player and the route answers `503 recording-unavailable` rather than 204.
  The table-facing recovery is the recording-paused state below. A Room with
  no open recording at all is a bug in this server rather than a disk failure,
  so it is logged loudly and played on: refusing would strand the table.
- `app.ts` owns **one operation queue per Room** (`enqueue`). Socket Commands,
  clock-driven folds, Seat mutations (claims, evictions, presence, sit-out/in,
  seat count), Room settings, a joiner's catch-up and the Room's own teardown
  run one at a time in arrival order; other Rooms are unaffected. HTTP routes
  await their turn in it, so a reply never races the broadcast it caused.
  Reads outside the queue are safe by construction: a staged transaction
  mutates nothing, so anything read there is already committed.
- The Room holds a **monotonic `revision`**, bumped on every committed
  transaction and by nothing else — a rejection or a Seat mutation changes no
  engine state and must not invalidate a queued fold, or the hand would stall.
  A queued clock-fold captures the revision when the clock is armed and is
  discarded on dequeue if the Room has advanced at all. Actor-matching is not
  enough: heads-up the non-button seat acts *last* preflop and *first* on the
  flop (`initialToAct`), so a fold queued behind that seat's own check finds it
  legitimately back on the clock a beat later. Every revision bump re-arms the
  clock, so discarding a stale fold never leaves a Room without one.

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
- **Room end**: `endRoom` runs in the Room's queue and handles both "End
  session" and the table's grace window elapsing identically — notify, close, discard transport bookkeeping,
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

## Recording (`packages/recording`)

One `RoomRecording` per live Room, opened by `POST /rooms` before the Room is
joinable and closed when it ends or the app does. It takes whole operations, and
owns ordering, retry, confirmed offsets and rollback itself; the server hands it
`transaction.operation` and waits. Its filesystem is injected, so every failure
path is testable and the shipped server has no way to make itself fail.

## Recording-paused

A failed append — whether the operation carried an accepted engine transition
or only a Rejection — never loses what could not be recorded and never lets
play continue unrecorded. `pauseRecording` (`app.ts`) cancels the Actor's
clock, retains the operation and its `DispatchTransaction` (when there is
one) in `pausedRooms`, and broadcasts `recording-paused` to every socket in
the Room. `isRecordingPaused` gates every further mutation while it holds:
gameplay and sitting in/out over the socket, and seat claims and eviction
over HTTP, all answer `recording-paused` — the same `ServerRejectionReason`
(`protocol/src/hand.ts`) regardless of transport, never an engine
`RejectionReason`. Sockets stay open, an existing identity may still
reconnect and receive the last committed view, and presence may still
change — none of that touches `rooms.dispatch`.

Only the table has an exit to choose:

- **Retry** (`POST /rooms/:code/recording/retry`) calls
  `RoomRecording.retry`, which truncates the Hand's files back to their last
  confirmed offsets before writing the retained operation fresh — the
  original failure's own rollback may itself have failed on the same broken
  disk. Once confirmed, `retryRecording` runs the retained transaction
  through the same `settleDispatch` the live commit path uses (commit, seat
  moves, fan-out, summary, bot scheduling), always with a **fresh full
  interval** on the Actor's clock — a player who lost thinking time to the
  outage is not penalised for it — and broadcasts `recording-resumed`. A
  retained Rejection has no transaction to settle: only the clock restarts.
- **End session** (`POST /rooms/:code/end`, unchanged) discards the retained
  transaction rather than committing it, and `drainRecording` calls
  `RoomRecording.discardLatched` — a best-effort restore of the confirmed
  tail, safe to call unconditionally since it no-ops when nothing latched —
  before closing.

**Continue without recording** is a later ticket's third exit; nothing here
should be read as ruling it out.

## Shutdown

`SIGINT`/`SIGTERM` (`server.ts`) and "End session" close a Room's recording
the same way — draining rather than dropping whatever was still in flight —
they just differ in what triggers it and what happens after.

- **A single Room ending** (`endRoom`, "End session" or the table's grace
  window elapsing) runs in that Room's own operation queue, so it is already
  ordered after anything already dispatched to it. It discards a paused
  Room's retained transaction, then `drainRecording` restores a paused
  recording's confirmed tail (`discardLatched`, a no-op unless the recording
  latched) and closes the writer, before the Room itself is discarded.
- **Process shutdown** (`onClose`, run from the `SIGINT`/`SIGTERM` handlers
  in `server.ts` via `app.close()`) closes every Room's recording instead of
  one. A command already dispatched but not yet appended when the signal
  lands must still land: `onClose` first awaits every Room's operation queue
  (`roomQueues`), *then* drains and closes each open `RoomRecording` the same
  way `endRoom` does, restoring any paused Room's confirmed tail first. Only
  once every recording is closed does the handler call `process.exit(0)` (or
  `1` if closing itself throws) — a deploy is `systemctl restart poker`, so
  this is the normal way the process ends, not an edge case.

Either path leaves every Hand file a clean prefix of confirmed operations, so
a recording closed this way always replays with no `incomplete-hand`. Only a
`SIGKILL` — which gives the process no chance to run `onClose` at all — can
still leave one torn final record; that is accepted and handled by the
incomplete-Hand rule (`packages/engine`'s Replay capability) rather than
defended against here.
