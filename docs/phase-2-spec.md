# Phase 2 build-ready specification

Assembled from the [wayfinder map](https://github.com/ewanhardingham/table-top-poker/issues/79)
that closed every decision below. This document gathers those decisions into
one place a build session can work from without re-deriving anything. Where a
decision needs its full rationale, the link goes to the ticket that made it —
this document states *what*, the ticket holds *why*.

Vocabulary is defined once, in [`CONTEXT.md`](../CONTEXT.md), and used without
redefinition here. Phase 1's decisions are in
[`docs/phase-1-spec.md`](phase-1-spec.md) and are not restated; where Phase 2
changes one, it says so explicitly.

## 1. Scope

**Phase 2 destination**: session replay for recorded hands, built as one
shared replay capability with two surfaces — a table-device review of the
current session's hands, and a non-interactive dev stepper over any log
directory on disk.

Phase 2 is [the second phase on the roadmap](https://github.com/ewanhardingham/table-top-poker/issues/5),
promoted ahead of tactile interactions and chips because its debugging value
(diagnosing engine behaviour while building every later phase) and its
player-facing value (reviewing a hand before the next one starts) both
outrank them, and it depends on neither.

### Where this starts from

**Until very recently, Phase 1 did not persist a live Room at all.** This was
the single most important premise correction on the map: for the whole time
this map was being charted, the log writer `HandLog` lived in
`packages/harness/src/persistence.ts` and was used only by the harness CLI —
`packages/server` had no `harness` dependency and performed no filesystem
write of any kind. Both `docs/phase-1-spec.md` §5 and this map's own opening
assumed otherwise. Phase 1 specified persistence and shipped it in the
harness only.

**That gap is now closed on `main`.**
[PR #94](https://github.com/ewanhardingham/table-top-poker/pull/94) (merged
as `a23f5c7`) lifts `HandLog` out of `harness` into a
`@table-top-poker/persistence` package and calls it from the server, closing
the last unchecked box of Phase 1's acceptance run
([#35](https://github.com/ewanhardingham/table-top-poker/issues/35)). A build
session starting Phase 2 therefore inherits a working — if shallow — server
write path rather than a blank slate.

So Phase 2 still opens a read path **and** a write path, and the write path
is still the larger of the two. But it is now an **evolution of
`packages/persistence`**, not a greenfield build: §3's reconciliation table
is the exact delta. None of this changed a decision on this map; it changed
what the ground looks like underneath it.

**Mechanical replay already works.** `packages/harness/src/replay.test.ts`
proves that re-piping a persisted command log through the harness reproduces
the persisted event log exactly. Phase 2 is not building replay; it is
building the durable recording beneath it and the two surfaces on top.

### In scope

- A durable, server-written **Room recording** (§3) — the write path Phase 1
  specified but never shipped in production.
- A pure, engine-owned **Replay capability** (§4) turning one Hand recording
  into an addressable flipbook of positions.
- A **table-device hand review** (§6) — hand picker plus chaptered scrub —
  reachable only between hands.
- A **dev stepper CLI** (§7) — `harness replay`, non-interactive, JSONL out.
- The **wire contract** (§5) serving hands and hand summaries back to the
  table over the existing room socket.

### Out of scope

(See the map's Out of scope section for the full rationale on each.)

- **Crash recovery — rebuilding a live Room from the log after a server
  restart.** Ruled out explicitly, because this is the phase whose
  ingredients make it tempting: Phase 2 builds log-reading, and someone will
  notice that recovery starts there. But log-reading is the small half.
  Recovery is about re-establishing *live* Room state — sockets, seat
  identity tokens, the action clock's deadline, who was disconnected and for
  how long, and whether a partially-written Hand can be resumed at all given
  append-as-you-go means the last line may be torn. That is a distinct
  feature which would roughly double this map and drag the clock-driven
  auto-fold hazard back open. If it is wanted, it deserves its own map.
- **Any full-reveal or post-mortem mode that breaks live visibility** —
  showing folded hole cards after the fact, whether between hands or at
  session end. It would hand players perfect knowledge of each other's
  folding tendencies, which the physical game never gives.
- **Phone-side per-seat replay.** Deferred: it introduces the
  review-while-on-the-clock auto-fold hazard, and it wants Phase 3's tactile
  work to have shaped the phone UI first.
- **A continuous cross-hand session timeline**, and **cross-session history
  browsing.** Both want a position or identity concept the per-Hand log
  partitioning and the LAN-only trust model do not currently express.
- **Tactile card interactions** — Phase 3. **Chips, stacks, pot and side-pot
  tracking** — Phase 4, conditional even then. **Public internet deployment,
  accounts, authentication; poker variants; multiple simultaneous tables** —
  the standing Phase 1 boundaries, unchanged.

## 2. Standing constraints

Four rules bind every section below. They were locked while charting and no
ticket may reopen them.

- **Replay obeys live visibility.** Replay re-projects `view(state, seatId)`;
  muck stays mucked, folded hole cards are never shown to anyone, showdown
  reveals exactly what showdown revealed. Phase 1's
  [fast-check secrecy property test](https://github.com/ewanhardingham/table-top-poker/issues/11)
  carries into Phase 2 **unchanged** — there is still no view type
  structurally capable of holding another seat's cards, so the property
  covers replay for free.
- **Position is an Event ordinal.** Position *n* is the state after applying
  *n* Events. This is the finest unambiguous granularity, so the
  auto-cascading street transitions from
  [issue #9](https://github.com/ewanhardingham/table-top-poker/issues/9) are
  visible as distinct beats rather than hidden inside one command. Each
  surface chunks on top as it likes.
- **The visibility split is by surface, never by a flag on the data.** The
  dev stepper gets unredacted state because it runs locally against files
  with no Room; the table path structurally cannot leak. **Nothing anywhere
  takes a `revealEverything` parameter**, an audience argument, or a
  redaction option.
- **Rejections are filtered out of the player-facing stream — structurally.**
  The Event log interleaves `HandEvent` and `Rejection`, but
  [issue #17](https://github.com/ewanhardingham/table-top-poker/issues/17)
  made rejections sender-only and never broadcast; replaying them to the room
  would show what the room never saw live. They stay in the dev stepper,
  where they are the most valuable records in the file. The table-facing
  position type has no `Rejection` variant at all — enforced by the type
  system, not by a runtime filter someone could bypass or forget.

**Verified while charting**: Events are already redacted per recipient on the
wire — `redactEventFor` (`packages/server/src/app.ts`) empties
`HoleCardsDealt.deals` for the table identity and filters to the owner's own
deal for a seat. The table learns showdown hole cards through the showdown
result (`packages/table-client/src/Seats.tsx`), not through `HoleCardsDealt`.
There is no existing leak to inherit.

## 3. Room recording — the write path
([Does the live server write the hand log at all?](https://github.com/ewanhardingham/table-top-poker/issues/86))

### Recording is a Room invariant

Every Room is recorded automatically from creation until it ends. There is no
opt-in, no configuration that disables it, and no mid-Room toggle. Raw
recordings remain local and unredacted; player-facing replay passes through
the table-safe projection of §4–§5. Phase 1's keep-everything-forever
retention remains binding — at roughly 10 KB per Hand, a session costs well
under a megabyte, so retention is not a capacity concern on the Pi.

The invariant is precisely **no *silently* unrecorded play**. Recording can
only stop by a deliberate human choice, made at the table, in response to a
failure the table has been told about — see recording-paused below. It can
never stop by misconfiguration, by an unset environment variable, or by a
write quietly failing.

A **`@table-top-poker/recording` workspace package** owns the durable
format. Both `server` and `harness` depend on it; it depends only on engine
types. The pure engine keeps all filesystem I/O out. This replaces the
harness-owned `HandLog` rather than making production depend on the
developer CLI.

> **Reconciliation with `packages/persistence`, already on `main`.** PR #94
> (§1) has already done the extraction half of this: `packages/persistence`
> holds `HandLog`, and the server writes through it. **Adopt and evolve that
> package — do not add a second one.**
>
> **Rename it, and rename its vocabulary with it.** This is not a
> build-session call: `CONTEXT.md` defines **Room recording**, **Hand
> recording**, **Hand context** and **Room ID**, and says outright *"Avoid:
> Log."* The merged package contradicts that glossary in every identifier it
> exports. Align them:
>
> | Today | Phase 2 |
> | --- | --- |
> | `@table-top-poker/persistence` | `@table-top-poker/recording` |
> | `HandLog` | the recording type (see the operation API below) |
> | `handLogPaths`, `HandLogPaths` | recording-path equivalents |
> | `LoggedCommand`, `LoggedEvent` | `RecordedCommand`, `RecordedEvent` |
> | `GameManifest`, `game.jsonl` | `room.json` |
> | `gameId`, `--game-id` | `roomId` |
> | `HAND_LOG_DIR` | `RECORDINGS_DIR` |
> | `--log-dir` | `--recordings-dir` |
>
> The rename is close to free: `packages/persistence/src/persistence.ts` is
> 92 lines, and the table below shows every row of it changing anyway. This
> is a rewrite that reuses a directory, not a refactor of surviving code —
> renaming during it costs nothing, and renaming after it is churn across
> `server`, `harness`, the re-export shim, three test files and the Pi's
> environment file. Delete `packages/harness/src/persistence.ts` (a
> re-export shim) outright rather than renaming it, and move its tests to
> the package that now owns the implementation.
>
> What is on `main` today does *not* yet satisfy the following, and this is
> the exact scope of Phase 2's write-path work:
>
> | §3 requires | `packages/persistence` as merged (`a23f5c7`) |
> | --- | --- |
> | Directory keyed by durable **Room ID** | keyed by the four-character **join code**, which is re-rolled on collision and not durable |
> | Recording is a **Room invariant**; startup fails if the root is unwritable | opt-in — `handLogDir === undefined` silently disables all recording |
> | Room creation **transactional** with immutable `room.json` (`roomId`, `code`, `createdAt`) | a `game.jsonl` manifest carrying only `v` and `seats`, written lazily on first `HandLog` construction — so the directory appears when the first hand starts, not when the Room is created, and a Room that never deals leaves no trace |
> | **Hand context sidecar** with `seats`, `button`, `handOrdinal`, `startedAt` | no context file; `startedAt` is nowhere, so §6's picker clock has no source |
> | Stage → **await append** → commit → broadcast, via a transaction handle | fire-and-forget after dispatch; a failed write cannot block the commit |
> | **recording-paused** on append failure | no failure path; a write error cannot pause the Room |
> | Ordered **async** queue per Room, confirmed offsets | synchronous `appendFileSync`, no offsets, no queue |
> | Injectable filesystem operations, so the failure paths are testable | direct `node:fs` calls, no seam |
> | Layout version on `room.json` | no `room.json` at all |
> | Per-record `v: ENGINE_LOG_VERSION` | already correct, and **unchanged** by this work |
>
> The gap is real but narrow in kind: what is on `main` is the *file-writing*
> half, and Phase 2 adds the *durability and identity* half around it.
> Nothing already merged needs to be reverted.

### Durable identity and layout

A Room receives an opaque UUID **Room ID** at creation, distinct from its
four-character live join code. Its directory is
`<RECORDINGS_DIR>/<room-id>/`; `RECORDINGS_DIR` defaults to `./recordings`.
Server startup creates and verifies that root and **fails to start** if it is
not writable. The harness retains its explicit `--recordings-dir` option.

PR #94 (§1) already introduced this env var on `main` under the name
`HAND_LOG_DIR`, wired through `deploy/poker.env.example` and
`deploy/poker.service`. It is renamed to `RECORDINGS_DIR` as part of the
vocabulary alignment above. That is a **deployment change, not just a code
change** — the Pi's `/etc/poker/poker.env` must be updated **in the same
release**, or the server starts against the default `./recordings` and a
session's hands land somewhere nobody looks. Treat it as a step in
`docs/deploy-pi.md`, not as a code detail.

Note what does *not* carry over: the current opt-in behaviour, where an unset
variable disables recording entirely, is gone (§3's invariant).

**The harness writes the same layout.** The dev stepper (§7) reads a Room
recording directory, and the only Room recordings a developer has locally are
usually harness-produced — so `--recordings-dir` runs must emit the layout
below, `room.json` and Hand context sidecars included, or the stepper cannot
read what the harness just wrote. A harness run has no live Room, so it
synthesises one: the existing `--game-id`, renamed `--room-id` and still
defaulting to a timestamp, becomes the **Room ID**, and `room.json`'s `code`
is `null` — a recording that was never joinable through a code. This is an
assembly-level consequence of two decisions meeting, not a fresh choice; if a
build session prefers a generated UUID with `--room-id` kept as a label,
nothing downstream depends on which.

Recording stays **optional in the harness** — a run with no
`--recordings-dir` writes nothing, as today. §3's invariant binds the server,
which hosts players who would not otherwise know whether their session is
being recorded; it does not bind a developer piping commands through a CLI.

Room creation is **transactional with recording creation**: `room.json` is
atomically written *before* the Room enters the live store or its code/QR is
returned. Failure rolls back the empty directory and creates no joinable
Room.

```text
<RECORDINGS_DIR>/<room-id>/
  room.json
  hand-0001.context.json
  hand-0001.commands.jsonl
  hand-0001.events.jsonl
  hand-0002.context.json
  …
```

- **`room.json`** is immutable metadata: `layoutVersion`, `roomId`, `code`,
  `createdAt`. It is *not* a fixed Seat manifest. Seat claims, evictions,
  presence and sitting-out transitions are not separately recorded. It is
  also the **only** place the layout version appears (see Version tagging).
- **`hand-NNNN.context.json`** is an immutable single JSON document: `v`,
  `roomId`, `handOrdinal`, `startedAt`, participating `seats`, starting
  `button`. It contains **no cards and no state snapshot**. The dedicated
  context sidecar is what leaves the Command JSONL as an exact Command-only
  stream. Its `seats` and `button` are engine-typed, so it carries
  `ENGINE_LOG_VERSION` like the Command and Event records.
- **`hand-NNNN.commands.jsonl` / `hand-NNNN.events.jsonl`** carry the exact
  engine Command stream and the resulting Event/`Rejection` stream.

Commands and Events remain **untimestamped**, so Replay position stays an
Event ordinal (§2). `startedAt` on the Hand context is the only clock in the
recording, and it exists because the picker needs it (§6).

**`startedAt` is captured when the Hand-start operation is *staged*, not when
its append confirms.** Those are now distinct moments (see the commit seam
below), and on a stalling disk they could be seconds apart. The timestamp
records when the Hand began for the players, not when the filesystem caught
up.

Each Hand is independently replayable: replaying Hand 14 never requires Hands
1–13, so corruption is isolated to the affected Hand.

### Engine-only Hand transcript

A Hand recording begins only when `startHand` or `nextHand` is **accepted**.
It contains every subsequent engine Command — *including* Commands the engine
rejects — and the resulting engine Events or `Rejection`.

Malformed messages, Room controls, authorization failures,
`not-enough-players` and other pre-engine failures stay in operational server
logs. They cannot be reproduced from Hand context and are not part of the
replayable transcript.

### Operation-oriented asynchronous persistence

The recording module accepts one complete engine **operation** rather than
exposing separate `logCommand` / `logEvent` calls:

```ts
await recording.append({
  context, // only when this operation starts a Hand
  command,
  outcome, // generated Events or one Rejection
});
```

It owns version tagging, serialization, Hand-file selection, ordered
asynchronous writes, confirmed byte offsets, partial-operation rollback,
retry, and clean close. Callers never coordinate individual lines.

**Its filesystem operations are injected**, in the shape `ActionClock`
(`packages/server/src/action-clock.ts`) already establishes for its timer
functions. This is not incidental: offset truncation, retained-operation
replay, the paused-state rejections and the incomplete-Hand handling of §4
are the most intricate logic in Phase 2 and the least reachable from a real
disk on demand. Injection makes all of them unit-testable against an
in-memory fake, and keeps fault-injection out of production code paths — the
server ships no way to make itself fail.

#### The commit seam: a transaction handle

`RoomStore` (`packages/server/src/rooms.ts`) **produces** the transaction;
`app.ts` **sequences** it. `dispatch` returns a staged transaction rather
than a completed result:

```ts
const tx = rooms.dispatch(code, identity, type); // pure, synchronous
await recording.append(tx.operation);            // may fail
tx.commit();                                     // or tx.discard()
```

This keeps `RoomStore` synchronous, filesystem-free and cheap to test — which
is where Phase 1's property tests and the engine-adjacent TDD discipline live
— while putting the `await` exactly where the broadcast already happens. The
obligation to commit or discard is carried by the returned handle rather than
by a convention a later edit can quietly drop.

`app.ts` owns **one operation queue per Room**. Socket Commands, clock-driven
folds and Seat mutations enter it in arrival order. Other Rooms remain
independent.

**Staging covers more than the engine transition.** On `main` today,
`dispatch` mutates `room.seats` (via `applyPendingShrink`), clears
`room.pendingSeatCount`, and reassigns `room.engine` — all *before* `decide`
runs and therefore before the outcome is known. All three must move behind
the transaction. A build session that reads "stages an engine transition" and
leaves `rooms.ts:491-507` where it is has not done this.

That ordering is already a live bug, tracked as
[#95](https://github.com/ewanhardingham/table-top-poker/issues/95): a
`nextHand` arriving mid-hand rewrites `room.engine.seats` and `button`, then
gets rejected `stale-next-hand`, leaving a seated player silently cut off
from every broadcast and auto-folded by the clock. It may be fixed
independently and first; the transaction seam is what stops the class of bug
returning.

#### The action clock across an await

Phase 1's clock is safe by construction, and `app.ts:407-411` says why: *"any
real action in between would have rescheduled (and thus replaced) this very
timer."* Synchronous dispatch means nothing can interleave. Awaiting an
append ends that guarantee, because **a fired timer is no longer a timer** —
it is a queued operation, and clearing the timer cannot recall it.

- **A queued clock-fold carries a room revision**, not just its expected
  Actor. The Room holds a monotonic counter bumped on every commit; the fold
  captures it at schedule time and is **discarded on dequeue if the Room has
  advanced at all**. Actor-matching alone is insufficient: heads-up, the
  non-button Seat acts *last* preflop and *first* on the flop
  (`initialToAct`, `packages/engine/src/table.ts:49-63`), so a stale fold
  expecting Seat X can find Seat X legitimately on the clock one beat later
  and fold a hand its owner just voluntarily checked. "Nothing has happened
  since I was scheduled" is the actual precondition for an auto-fold, and the
  revision is the only thing that states it exactly.
- **The clock arms after commit**, not at staging. Appends should be
  single-digit milliseconds, so this is immaterial normally; on a disk
  grinding at seconds per append it matters a great deal, and that latency
  must not be deducted from a player's thinking time.

### Recording-paused: recoverable failure

A failed append **does not end the Room and never permits unrecorded play**.
It cancels the action clock, retains the failed operation, and puts that Room
into a blocked **recording-paused** state.

- Existing sockets stay connected; existing identities may reconnect and
  receive the last committed view; presence may continue changing.
- Gameplay, new Seat claims, eviction and sitting in/out are rejected with a
  `recording-paused` reason code. **This is a `ServerRejectionReason`**
  (`packages/protocol/src/hand.ts`, alongside `room-not-found` and
  `not-permitted`), **not** an engine `RejectionReason`
  (`packages/engine/src/types.ts`). The engine knows nothing about recording
  and must not learn — a recording failure is not a rule violation, and
  `decide` never sees one.
- Only the table may choose **Retry recording**, **Continue without
  recording**, or **End session**. Filesystem details stay in operational
  server logs.
- **Retry** truncates affected files to their last confirmed offsets, appends
  the retained operation again, and only then commits/broadcasts it and
  restarts the Actor's clock with a **fresh** interval.
- **Ending a paused Room** discards the uncommitted operation after restoring
  parseable confirmed tails.

**The Actor's clock restarts at its full interval after a Retry.** This is a
player-facing rule, not an implementation detail of the recovery path: a
player who lost forty seconds of thinking time to a disk stall is not
penalised for it.

##### Continue without recording

The third exit exists because the failure this state is most likely to meet
is **not** transient. A worn SD card does not fail intermittently; it flips
the filesystem read-only and stays there. Under Retry-or-End alone, every
retry fails identically and the only working control ends the session — a
twelve-pound card ends poker night, mid-hand, with no path forward.

Choosing **Continue without recording** resumes play immediately and stops
recording for the remainder of the Room's life. It does not flap back on: the
Room does not retry per hand, and there is no automatic resumption if the
disk recovers. A persistent banner on the table states that hands from here
are not being recorded.

What is already on disk stays valid and replayable. The Hand that was
in flight when the append failed is left as it lies — the repairs described
above (truncate to confirmed offsets, restore parseable tails) are themselves
**writes**, and cannot run on the filesystem that just refused one. §4's
incomplete-Hand rule is what handles the result, and the picker does not
offer that Hand.

This is the boundary of §3's invariant, and it is drawn deliberately: play
can leave the recorded state, but only through a decision a human made after
being told. The property that survives is that recording never stops
*silently*.

Normal Room ending and `SIGINT`/`SIGTERM` stop new operations, drain the
active operation, restore confirmed tails if paused, close recording handles,
then remove the Room or exit. `SIGKILL` may still leave one torn final
record, handled by the incomplete-Hand rule in §4.

### Version tagging

There are **two version numbers, and they mean different things.**

- **`ENGINE_LOG_VERSION`** (`packages/engine/src/version.ts`) **stays `1`.**
  It is the per-record `v` on every Command, Event, Rejection and Hand
  context, and it keeps exactly the meaning its own doc comment gives it:
  *"bumped whenever a change to `HandEvent`/`Command` shapes or the shuffle
  would break bit-identical replay."*
- **The layout version** is a single field on **`room.json`**, and nowhere
  else. It describes the directory shape — `room.json` itself, the context
  sidecar, the Room ID keying — none of which the engine knows about.

**Phase 2 does not bump `ENGINE_LOG_VERSION`.** It changes no `HandEvent`
shape, no `Command` shape and no shuffle. A `v: 1` record read by the Phase 2
engine replays bit-identically, which is precisely what the constant is for.
Bumping it would make the engine refuse logs it can replay perfectly.

Detecting a pre-Phase-2 directory needs no version comparison at all: it has
**no `room.json`**. The layouts differ structurally, which is a stronger
signal than a number.

> **Splitting these is an assembly reconciliation, not a map decision.**
> [#86](https://github.com/ewanhardingham/table-top-poker/issues/86) said
> "recording format version 2" and
> [#80](https://github.com/ewanhardingham/table-top-poker/issues/80) said
> "the running engine's `ENGINE_LOG_VERSION`"; neither ticket noticed the
> other. Collapsing them into one tag was the first reading assembled here,
> and it was wrong on two counts. It contradicted the constant's documented
> contract, as above. And its stated justification — "the server produced no
> version-1 Room recordings" — died when
> [PR #94](https://github.com/ewanhardingham/table-top-poker/pull/94) merged:
> the server writes `v: 1` today.
>
> Splitting them costs one field on one file and **no fixture churn** —
> `persistence.test.ts`, `harness.test.ts` and `replay.test.ts` all keep
> asserting `v: ENGINE_LOG_VERSION` unchanged, and records already written on
> `main` stay valid. What must not happen is a build session bumping the
> engine version out of habit because the recording layout changed.

## 4. The Replay capability
([Replay capability: API, package placement and version-tag handling](https://github.com/ewanhardingham/table-top-poker/issues/80))

### Ownership and inputs

Replay is a **pure engine capability**, owned by `@table-top-poker/engine`.
File discovery, JSONL reading and torn-line detection stay in the I/O-owning
callers (`harness` for the dev stepper, `server` for table replay). No
filesystem, clock, ambient randomness or surface-specific visibility option
enters the engine.

The capability is scoped to **one Hand** and takes parsed, versioned input:

- the Hand-start context — participating Seats and starting Button (§3);
- that Hand's ordered Command records;
- its persisted Event/`Rejection` records, **as audit evidence**.

The starting context is not a state snapshot and carries no cards.

**Replay builds its own starting state, and the engine exports nothing new
for it.** `createInitialState` (`packages/engine/src/room.ts:10-15`)
hard-codes `button` to `seats[0]`, and the live Button is chosen outside the
engine by `resolveButtonFor` (`packages/server/src/rooms.ts:505`) — so there
is no supported way today to construct a state at a recorded Button. Since
Replay lives *inside* the engine, it constructs `{ seats, button, hand: null }`
directly and no public constructor is added. A general "state at an arbitrary
Button" export would be a foot-gun for every caller except this one, and
would weaken a real invariant for live Rooms.

**A context is valid when** its `button` is a member of its `seats`, and its
`seats` satisfy the same 2-to-8 bound `createInitialState` enforces
(`room.ts:11`). §7's exit table promises an "invalid context" failure and
these are its conditions. Without checking them, a context naming a Button
that was never dealt in fails somewhere inside `rotateFromButton` instead of
at the boundary.

### Authority and validation

The Command log remains the source of truth fixed by Phase 1's
[Event log, persistence and replay guarantees](https://github.com/ewanhardingham/table-top-poker/issues/10).
Replay re-runs Commands through the engine, folds generated Events through
`apply`, and **compares** the complete generated Event/`Rejection` sequence
against the persisted audit stream.

A difference between complete records is a **hard failure** identifying the
first differing record. Replay never silently trusts, repairs or substitutes
conflicting persisted Events.

Rejections remain in the validated developer transcript, do not change state,
and **do not advance the Event ordinal**.

### The result: a flipbook

A successful replay returns the whole Hand as a small flipbook of positions:

- **position 0** — the starting state, no Event;
- **position *n*** — the *n*th generated Event, and the complete
  `EngineState` after applying it.

Each position carries its Event *as well as* its resulting state. This is not
a convenience: it is load-bearing three times over, and is why a sequence of
projected views would not do.

> **The terminal-view finding.** `FoldedOutView`
> (`packages/engine/src/view.ts`) carries only `button` and `winner` — **no
> board**. So the board of a hand that ended by fold-out is unreachable from
> that hand's final view, even though `BoardDealt` was public and the table
> watched those cards land. The picker (§6) renders that board as its primary
> identifying feature and derives its betting-shape phrase from public
> `ActionTaken` events. Likewise `TableViewBetting.seats` carries only
> `folded`, with no action — so the scrub's per-seat action labels (§6) must
> be folded back out of the Event stream. Any surface fed views alone is
> unbuildable.

The engine returns **complete state**, not a projected view and not a
`revealEverything` option. The dev stepper may render that state directly;
the server must pass every position through the existing `view(state,
"table")` boundary and expose only the table-safe protocol shape (§5).

Which notches are visually significant is a surface decision, not engine
policy.

### Version mismatch and the damaged tail

Every supplied context, Command, Event and `Rejection` record must carry the
running engine's `ENGINE_LOG_VERSION`; `room.json` must carry a supported
layout version (§3). Either mismatch is an immediate **unsupported-version
failure** reporting expected version, actual version, file and record. Phase
2 has no migration, guessing or force override; an old log requires a
compatible build.

A replay is **incomplete** — not corrupt — in either of two cases:

- **Exactly one clearly torn final JSONL record.** The I/O adapter may
  discard it, reporting its file and line.
- **An orphaned trailing Command.** The Command log runs past the persisted
  Event stream: every line in both files parses, nothing disagrees, there is
  simply less audit evidence than there are Commands. Replay stops at the
  last fully-corroborated operation and reports the Command ordinal it
  stopped at.

The second case is the *likely* wreckage, not an exotic one. It is what a
`SIGKILL` mid-operation leaves, and it is what a filesystem that went
read-only leaves — including after **Continue without recording** (§3),
where the repairs that would otherwise tidy the tail cannot run because they
are themselves writes. Treating a Command with no recorded outcome as
corruption would make the dev stepper emit nothing in exactly the situation a
developer most wants to look at.

Either way:

- The dev stepper shows the recoverable complete prefix with a warning and
  exit `2` (§7).
- The table hand picker **must not offer an incomplete Hand** (§6).

Invalid data anywhere else, or disagreement between complete generated and
persisted records, is a hard failure **for that Hand only**.

## 5. Wire contract
([Wire contract for serving a recorded hand back to the table](https://github.com/ewanhardingham/table-top-poker/issues/83))

### Transport: the existing room socket

Replay rides as WebSocket messages on the existing room socket. **No separate
HTTP route.** The socket already carries room and per-seat bearer-token
identity from connect time (`docs/phase-1-spec.md` §6–§7); an HTTP route
would need to re-send that token per request, duplicating an auth story the
socket already resolved once. The one existing HTTP route (`POST /rooms`) is
pre-identity room creation — a different case, not a precedent to extend.

### Incoming request: same Zod boundary, own schema

The replay request (`get-hand` / `list-hands`-shaped) is untrusted JSON
crossing into server code — the same seam
[Transport and server framework](https://github.com/ewanhardingham/table-top-poker/issues/12)
staked Zod validation on, even though it never reaches `decide`. It gets a
**sibling discriminated-union schema** next to `ClientCommandSchema` in the
`protocol` package, validated at the same boundary before the server acts on
it.

### Response: event + view per position, whole hand at once

Each position on the wire is `{ event: HandEvent | null, view: TableView }`,
position 0 carrying `event: null` — mirroring the existing
`HandUpdateMessage` pairing (`packages/protocol/src/hand.ts`) rather than
inventing a new shape. This is not a fresh choice; it falls out of the
terminal-view finding in §4.

**The whole hand arrives in one response.** A `TableView` is small — `phase`,
`button`, `street`, a board of at most five cards, `toAct` of at most eight
ids, and `seats` as at most eight `{ seatId, folded }` pairs
(`packages/engine/src/view.ts:48-55`) — roughly **250–350 bytes** serialized.
A typical thirty-five-position hand with its events is therefore **under
20 KB in one message**. The scrub (§6) needs every position up front to lay
out its ticked track and street chapters, so partial delivery buys nothing
and no chunking or pagination is specified.

**Hand length is unbounded, and that is accepted.** `raise` is always legal
and uncapped (`legalActions`, `packages/engine/src/table.ts:110-115`), and
Phase 1 has no chips, so nothing but the players' patience ends a re-raise
war. This does not threaten the wire — a megabyte would take some three
thousand raises. It degrades the **scrub** long before that, which §6
addresses. No cap is imposed: §3's whole thrust is that recording never
refuses to record, and a table capable of producing a four-hundred-event hand
has a more pressing problem than its replay UI.

The table-facing position type has **no `Rejection` variant** (§2).

### Hand listing: a dedicated message, pushed proactively

A distinct message carries one summary per hand, **not** folded into
`RoomView` — which changes on a different cadence (seats, presence) and
should not grow on every seat change.

Per hand the summary carries:

- `handOrdinal` — 1-based, from the `hand-NNNN` partition;
- `startedAt` — ISO string (§6);
- `button`;
- seats dealt in, and survivors;
- the public **board**;
- the **street reached**;
- the **betting shape**, as a structured descriptor — see below;
- the **outcome**, including showdown reveals.

#### One derivation, shared

The summary is produced by a **pure function over an event array**:

```ts
summarise(events: readonly HandEvent[], context: HandContext): HandSummary;
```

No I/O, no clock, no ambient state. The server calls it with the Events it
just broadcast; anything replaying from disk calls it with the Events it just
validated. This is the whole point: without a shared function, the same facts
— board, street, survivors, betting shape, outcome — get derived by two
independent code paths that can drift silently, so the picker would show a
summary disagreeing with what the scrub renders when you tap it, and no test
would catch it.

The server calls `summarise` **right after each hand completes** — the same
moment "Review hands" becomes reachable (§6) — and holds the accumulated list
in memory for the Room's life. No disk read is involved. A server restart
destroys the Room outright (`RoomStore` holds `#rooms` in a plain `Map` with
no rehydration), so there is no surviving session whose summaries would need
rebuilding; that is crash recovery, out of scope per §1.

#### The betting shape is structured, not prose

`bettingShape` is a discriminated union, not a sentence:

```ts
| { kind: "walk" }
| { kind: "preflop-raise" }
| { kind: "checked-down" }
| { kind: "one-raise" }
| { kind: "raise-war"; raises: number }
```

The wording lives in `table-client` with the rest of the felt's copy (§6
gives the phrasing). Derivation — detecting a walk, distinguishing
checked-down from one-raise, counting raises — is the genuinely testable
part, and it stays in `summarise` where it is unit-testable without a DOM.

The deciding argument is §7. The dev stepper exists so an agent can drive and
diff it; shipping `"raise war — 4 raises"` into a JSONL stream forces the
consumer to parse English back into a number `summarise` already had. Every
other summary field is structured; prose here would be the sole exception,
and an artifact of §6 having been settled by a visual prototype in which the
phrase *was* the deliverable.

**The table also gets the full list on connect.** Incremental pushes alone
would leave a reloaded or reconnected table device with an empty picker for
hands it had already seen, and Phase 1's catch-up is deliberately "one fresh
view snapshot, not event replay" (`docs/phase-1-spec.md` §6) — which carries
no summaries. Surviving a client reload was one of the reasons this map chose
a served durable log over client-side buffering in the first place, so the
server sends the accumulated list when a table identity connects, and pushes
one summary per hand thereafter. This is what the `list-hands` request shape
is for; whether the server volunteers the list on connect or the table asks
once on mount is a build-session call, but the picker must never be
missing hands the session already played.

Only **complete, valid** Hand recordings enter the listing (§4).

## 6. The table-device review

Two surfaces on one screen: a picker that chooses a hand, and a scrub that
plays it back.

### When it is reachable, and how it is dismissed

- **Between hands only.** Review is reachable exactly when the Deal hand /
  Next hand rail shows (`packages/table-client/src/TableControls.tsx`).
- **Table device only.** The table holds no seat — role is fixed by arrival
  ([issue #13](https://github.com/ewanhardingham/table-top-poker/issues/13))
  — so review can never collide with a player's action clock. That matters,
  because clock-driven auto-fold is the standing top design hazard.
- **Force-dismissed when a hand starts.** A review left open can never
  swallow the board. The dismissal is abrupt by construction: no
  confirmation, no "are you sure". Felt mid-playback in the prototype, the
  abruptness is correct — anything softer risks the review still being up
  when cards are on the table.
- **Entry point**: a **Review hands** button, a peer of the other actions in
  the right-hand table control rail — not a separate affordance elsewhere on
  the felt.
- **Exit**: a **Back to hands** control from the scrub; closing the picker
  returns to the felt.

### The hand picker
([The hand picker: what a session's hands look like when you're choosing one](https://github.com/ewanhardingham/table-top-poker/issues/81),
settled by prototype on branch `prototype/hand-picker`)

**A hand is identified by its board.** A vertically scrolling list, **newest
hand first**, one row per hand — the filmstrip. Rejected: a card-less ledger
of the betting story, and a grid of mini-felt tiles keyed on who was in.

Each row shows, all of it derived from Events the table saw live:

- **Ordinal** — 1-based, from the `hand-NNNN` partition.
- **Board** — as real cards, five slots, undealt streets shown as dashed
  empties so a preflop walk reads as a visibly short hand rather than a
  broken row.
- **Survivors and street** — "3 to the turn".
- **Betting shape** — rendered client-side from the structured descriptor
  §5 defines: *walk — folded round*, *preflop raise took it*, *checked
  down*, *one raise*, *raise war — 4 raises*. These strings are this
  client's copy, not a wire format; changing them is a `table-client`
  change alone.
- **Outcome** — showdown winners and their hand description, or "Seat N wins
  — everyone folded".
- **Button seat**, with the start time on the same line (below).

> **A fold-out hand is not featureless.** `BoardDealt` and every
> `ActionTaken` are public, so a fold-out carries its board up to the street
> it died on, who folded and in what order, how many saw the flop, and how
> many raises there were. "Seat 3 wins — everyone folded" is indistinguishable
> hand to hand; "3 to the turn, raise war — 4 raises, Seat 2 wins" is not.
> The betting shape is what makes the fold-outs distinguishable.

**Ordering and scroll.** Newest first: the hand you want to re-watch is
nearly always the one that just happened, and it should be under your hand
without scrolling. At table-device size a row shows a full five-card board at
a legible size and roughly six to eight rows fit; a session runs to dozens of
hands, so no layout fits them all. The design optimises for reaching the last
few instantly rather than seeing all of them at once.

**In-progress and abandoned hands never appear.** Review only opens between
hands, so at the moment the picker opens there is no hand in progress — an
"in progress" row is a state the picker cannot be in. Incomplete Hand
recordings (§4) are likewise never offered.

### The start-time clock
([Does the hand picker show when each Hand started?](https://github.com/ewanhardingham/table-top-poker/issues/87),
settled by prototype on branch `prototype/hand-picker-clock`)

Each row shows a **relative, live-ticking start time** — "just now" → "1m
ago" → "6m ago" — on the same line as "Button Seat N", so the rest of the row
never shifts as the label changes. Rejected: no clock at all, and an absolute
local time ("9:10 PM"), which is less immediately legible for the
recent-hand case that matters most.

This is why `startedAt` is in the Hand context (§3) *and* the player-facing
summary (§5): the client needs it to compute and re-tick the label, not just
to sort — ordering was already newest-first via the hand ordinal.

**Known cost, accepted**: the label goes stale while the picker stays open.
The production picker needs its **own ticking clock** — an interval polling
`Date.now()`, as in the prototype's `useNow` — not a label computed once at
mount.

### Playback: a chaptered scrub
([Replay playback on the table: autoplay, stepping or scrub](https://github.com/ewanhardingham/table-top-poker/issues/82),
settled by prototype on branch `prototype/replay-transport`)

**Replay is a scrub, not a playback.** A timeline the width of the felt,
ticked once per Event ordinal, chaptered by street, draggable to any
position, with autoplay as a secondary toggle rather than the primary mode.
Rejected: weighted autoplay with the felt as a pause target, and step-on-tap
with no clock at all.

**The transport:**

- **A ticked track** — one tick per Event ordinal, so the hand's *shape*
  (where the action clustered) is legible before you touch it. Street
  boundaries get taller, heavier ticks.
  - **Ticks are a visual affordance and may collapse on unusually long
    hands; street chapters are the navigation contract.** Hand length is
    unbounded (§5), and one-tick-per-ordinal stops being legible somewhere
    past a few hundred positions — sub-pixel ticks, a thumb moving many
    positions per pixel. Chapters remain usable at any length. Do not treat
    one-tick-per-ordinal as inviolable; do not let chapter seeking degrade.
- **Street chapters** — Preflop / Flop / Turn / River chips seek directly.
  These are the landmarks people navigate by ("on the turn, when Seat 4
  raised"), and they are what makes getting to a moment one gesture instead
  of a wait.
  - **A chapter must anchor on the street's `BoardDealt`, not its
    `StreetStarted`.** The engine's cascade emits `StreetClosed → BoardDealt
    → StreetStarted` as three consecutive ordinals, so anchoring on the
    street start lands *after* the cards appeared and a viewer who taps
    "Turn" never sees the turn card arrive. This generalises to any
    seek-by-street affordance.
- **Autoplay is secondary** — a play button runs the hand at the per-event
  weighting, but it is not the default state, and pressing the track stops
  it. The measurement that settled this: weighted playback of a 33-event
  fixture runs **27.7s** against uniform's **28.1s**. Weighting redistributes
  attention, it does not shorten anything, and ~28s per hand *between* hands
  is too long to be the primary way in. Weighting earns its place by holding
  the beats that change the felt (a board deal, a showdown) and skipping the
  ones that do not (`StreetClosed`).
- **Sized for a finger** — the grab zone is the full height of the track row
  rather than the visible rail; the thumb stays visible under a fingertip;
  chips clear the touch-target floor.

**What the felt shows at a position:**

- **The live rendering, projected.** `Seats` and `Board` are the live
  components, fed `view(state, "table")` at the chosen ordinal. Replay adds
  no parallel rendering path and takes **no `replay` flag**, so the
  visibility guarantee of §2 is inherited rather than re-implemented.
- **Per-seat action labels** — every seat that has already acted *this
  street* carries a pill in the same slot the live "To act" pill uses. Raise
  is **orange, not accent red**: red belongs to "To act" (both the pill and
  the seat-pod glow), so a red raise label reads as a seat being on the
  clock. Call is the one **cool** fill on an entirely warm felt, which keeps
  it separable from raise at a glance. Labels clear at each new street —
  "Seat 4 called" means nothing once the turn is out.
- **A caption strip** naming the beat just landed on, in its own band so it
  can never sit on a seat pod.
- **No Event ordinal in the UI.** Position-as-ordinal is the model's unit and
  stays the addressing scheme, but `11 / 33` means nothing to someone at a
  poker table. The track shows progress; the caption says what happened.
  Which hand is under review lives in the **status bar** — the same bar the
  connection badge sits in — not a second title floating over the felt.
- **Bands top and bottom.** The stage reserves the transport's height plus a
  caption strip at the bottom and a matching band at the top, then lays the
  table out in what is left. A seat pod is anchored by its avatar and grows
  *around* that anchor, so a top-row pod carrying hole cards and a showdown
  description otherwise reaches past `posFor`'s 10% and clips the felt's
  edge; the bottom row overlaps the transport for the mirror reason.

**Known seam, already fixed — lift it, do not redesign it.** `Board`'s
per-card entry animation is keyed on mount, so the prototype stage remounts
it per position to make a `BoardDealt` read as a *deal* rather than as cards
that were suddenly always there. That works for stepping and autoplay but
re-fires the animation on every scrub tick. **The fix already exists**, on
`prototype/replay-transport` at commit `b5d691e`: cards keyed by rank+suit
with the per-phase branches unified, which also stops a live hand re-dealing
all five cards when it crosses betting → showdown. It is entangled in that
commit with five prototype-only files, so it does not cherry-pick — lift the
`Board.tsx` and `StatusBar.tsx` changes as part of the replay-stage work that
consumes them. See §8.

## 7. The dev stepper CLI
([Dev stepper CLI surface](https://github.com/ewanhardingham/table-top-poker/issues/84))

**Non-interactive by design.** Agents author most of the code in this repo,
so a tool an agent can drive and diff beats an interactive TUI it cannot.

### Command and addressing

The dev stepper is the `replay` subcommand of the existing `harness` binary.
The current stdin/stdout harness mode remains backward-compatible; Phase 2
adds no second executable.

```sh
harness replay <room> --hand <hand-ordinal>
harness replay <room> --hand <hand-ordinal> --at <event-ordinal>
harness replay <room> --hand <hand-ordinal> --from <n> --to <m>
```

With no position selector the command emits the whole Hand; `--at` emits one
position; `--from`/`--to` are a paired, inclusive range.

**The positional `<room>` accepts three forms**, because a Room recording
directory is named by an opaque UUID and nobody remembers one:

- a **path** to a Room recording directory (§3's layout);
- a four-character **join code**, resolved by scanning `RECORDINGS_DIR` for a
  matching `room.json`;
- the literal **`latest`**, the most recently created recording under
  `RECORDINGS_DIR`.

`latest` is the form that gets used: the hand you want to debug is nearly
always from the session you just played — the same argument §6 uses for
ordering the picker newest-first.

Join codes are **recycled**: `generateRoomCode`
(`packages/server/src/rooms.ts:320`) tests collisions against live Rooms
only, so one code names many directories over a Pi's lifetime. A code
matching several resolves to the most recent, and the CLI prints which
directory it chose to **stderr** — never stdout, which stays byte-stable and
diffable (below). This is also why directories are not named or symlinked by
code, and why the Room ID exists at all.

### Machine-readable output

Stdout is **JSON Lines only** — one self-contained record per selected
position:

```json
{"kind":"position","hand":14,"position":37,"event":{},"state":{}}
```

Position 0 has `event: null`. Every other position carries its generated
Event and the complete **unredacted** `EngineState` after that Event. The CLI
does not duplicate derived per-Seat views and has no human-shaped output
mode. Source paths and diagnostics stay **off stdout**, so output stays
stable and diffable.

Rejections are first-class records, interleaved in transcript order:

```json
{"kind":"rejection","hand":14,"position":37,"record":42,"rejection":{}}
```

A Rejection does not create or advance a position. `position` identifies the
unchanged state in which it occurred; `record` identifies its ordinal in the
persisted Event/`Rejection` audit stream. Full and ranged output includes
Rejections whose unchanged position is selected — so `--at 37` emits position
37 *and* every Rejection that occurred while the Hand remained there.

### Visibility boundary

Unredacted serialization exists **only** in harness-owned CLI code. The
server has a separate adapter over the engine Replay capability and
immediately projects every state through `view(state, "table")` into a
protocol type that cannot contain `EngineState`. The `protocol` package
exposes only the table-safe replay shape.

There is no shared formatter accepting an audience, redaction option or
`revealEverything` flag (§2). This is what lets the local filesystem tool
inspect complete state without creating an unredacted server route.

### Validation, diagnostics and exit status

The CLI loads and validates the **complete requested Hand before writing any
stdout**.

| Outcome | stdout | stderr | exit |
| --- | --- | --- | --- |
| Complete replay | all selected records | — | `0` |
| Missing file, malformed complete record, invalid context, unsupported version, or generated-vs-persisted disagreement | nothing | first failure | `1` |
| Exactly one torn final JSONL record | validated complete prefix | structured `incomplete-hand` warning with file and line | `2` |
| Orphaned trailing Command — the Command log runs past the persisted Events (§4) | validated complete prefix | structured `incomplete-hand` warning naming the Command ordinal it stopped at | `2` |

An unsupported-version diagnostic includes expected version, actual version,
file, and line or record. There is no force flag, migration or partial replay
for a version mismatch. The distinct exit `2` exists so automation cannot
mistake a recoverable prefix for a complete Hand.

## 8. Corrections to existing documents

Assembly surfaced three statements that were wrong or missing. Each is fixed
in place rather than merely noted here.

1. **`CONTEXT.md` was missing every term Phase 2 introduced.** The
   resolutions of
   [#80](https://github.com/ewanhardingham/table-top-poker/issues/80) and
   [#86](https://github.com/ewanhardingham/table-top-poker/issues/86) both
   state that `CONTEXT.md` "now defines" **Replay**, **Replay position**,
   **Rejection**, **Room ID**, **Room recording**, **Hand context** and
   **Hand recording** — but no such edit ever landed on `main`; the tickets
   were grilling tickets and produced no code. The glossary is updated as
   part of this assembly.
2. **`docs/phase-1-spec.md` §4 and §5 describe a server-side log the server
   never wrote.** §4's "the raw event log is server-side only in Phase 1" and
   §5's persistence section specify a write path that, on `main`, shipped
   only in the harness. Corrected in place with a pointer to §3 here.
   ([PR #94](https://github.com/ewanhardingham/table-top-poker/pull/94) has
   since closed that Phase 1 gap — §1 and §3. The Phase 1 spec was not wrong
   about the *decision*, only about what had been built.)
3. **Two version numbers, deliberately separated.** §3 above reconciles
   #86's "recording format version 2" with #80's "must carry the running
   engine's `ENGINE_LOG_VERSION`": they are *different* tags with different
   meanings. `ENGINE_LOG_VERSION` **stays `1`** — Phase 2 changes no event
   shape, no command shape and no shuffle — and the layout version lives on
   `room.json` alone.
4. **A live bug on `main`, found while grilling this spec.** `dispatch`
   mutates `room.engine` before `decide` runs, so a `nextHand` arriving
   mid-hand is rejected `stale-next-hand` *after* rewriting the live Hand's
   seats and button — silently cutting a seated player off from every
   broadcast and leaving them to be auto-folded. Raised as
   [#95](https://github.com/ewanhardingham/table-top-poker/issues/95), fixable
   independently of Phase 2, and structurally prevented by §3's transaction
   seam.

Also note: the prototype branches strand **Phase 1 visual fixes** that belong
to [map #57](https://github.com/ewanhardingham/table-top-poker/issues/57),
none of them replay-specific. They split by how cleanly they extract:

- **Land before Phase 2 starts** — `aad3d5c` (rail grouped into one
  fixed-width column), `cfc6006` (both pill tones rendering their label as
  authored), `636cbf6` (both secondary rail actions sharing a plain outline).
  Raised as
  [#96](https://github.com/ewanhardingham/table-top-poker/issues/96). Phase 2
  adds **Review hands** as a peer of the existing actions in that exact rail
  (§6), so building against a rail that is about to be regrouped is rework.
  Note `aad3d5c` also touches a prototype-only file; that hunk must be
  dropped during the pick.
- **Lands with the replay work** — the `Board` fix and the `StatusBar`
  `leading` slot, entangled in `b5d691e` with five prototype-only files. §6's
  "Known seam" points at them; they are only observably a fix under
  scrubbing, so they review better alongside the code that needs them.

## 9. Acceptance

Phase 2 is done when all of the following are demonstrably true, in one
sitting, on real devices at a real table.

**The write path**

- [ ] Creating a Room produces `<RECORDINGS_DIR>/<room-id>/room.json` before
      the join code or QR is shown; a non-writable `RECORDINGS_DIR` prevents
      the server from starting at all.
- [ ] Playing several hands produces one
      `context.json` / `commands.jsonl` / `events.jsonl` triplet per hand,
      every record tagged `v: ENGINE_LOG_VERSION` (still `1`), with no
      timestamps on Commands or Events, and the layout version appearing on
      `room.json` and nowhere else.
- [ ] A rejected command appears in the hand's `events.jsonl` as a
      `Rejection`, and does not advance the Event ordinal.
- [ ] With a hand in progress, `chmod a-w` on the recordings directory, then
      act: the Room enters **recording-paused** — sockets stay up, gameplay
      is rejected with `recording-paused`, the action clock is cancelled.
      Restore write access, and **Retry recording** resumes play with a fresh
      clock and a correctly-truncated, valid file tail.
- [ ] From that same paused state with write access **still revoked**,
      **Continue without recording** resumes play immediately, the table
      shows a persistent not-recording banner, recording does not resume on
      the next hand, and the hands recorded before the failure remain
      replayable and offered in the picker.
- [ ] A player whose seat is momentarily `disconnected` mid-hand keeps
      receiving `hand-update` messages — the regression guarded by
      [#95](https://github.com/ewanhardingham/table-top-poker/issues/95).

**Replay and the dev stepper**

- [ ] `harness replay <dir> --hand N` emits one JSONL position per Event
      ordinal, exits `0`, and re-running it byte-identically diffs clean.
- [ ] A hand played through the **harness** with `--recordings-dir` produces
      a directory the stepper can read back without any conversion step —
      `room.json` and context sidecars included.
- [ ] `harness replay latest --hand N` and `harness replay <join-code> --hand N`
      both resolve to the expected directory, and the chosen directory is
      named on **stderr** while stdout stays byte-identical to the
      path-addressed run.
- [ ] `--at` and `--from`/`--to` select correctly, and `--at N` also emits
      every Rejection that occurred at position N.
- [ ] Truncating the last line of an `events.jsonl` yields the complete
      prefix on stdout, an `incomplete-hand` warning on stderr naming file
      and line, and exit `2`.
- [ ] Deleting the last *whole* line of an `events.jsonl`, so a trailing
      Command is orphaned, likewise yields the complete prefix, an
      `incomplete-hand` warning naming the Command ordinal, and exit `2` —
      **not** a hard failure.
- [ ] Corrupting a *non-final* record, or making a persisted Event disagree
      with the replayed one, yields **no stdout records**, a diagnostic
      naming the first differing record, and exit `1`.
- [ ] A context whose `button` is not among its `seats` yields an
      invalid-context diagnostic and exit `1`.
- [ ] A record carrying an unsupported `ENGINE_LOG_VERSION`, or a
      `room.json` carrying an unsupported layout version, yields an
      unsupported-version diagnostic naming expected and actual version, file
      and record — and exit `1`.

**The table review**

- [ ] **Review hands** appears in the table control rail only between hands,
      and is not reachable while a hand is in progress.
- [ ] The picker lists the session's completed hands newest-first, each row
      showing board (with dashed empties for undealt streets), survivors and
      street, betting shape, outcome, button seat, and a relative start time
      that **visibly re-ticks** while the picker stays open.
- [ ] An incomplete Hand recording is **not** offered in the picker.
- [ ] **Reloading the table device mid-session** and reopening the picker
      still lists every hand played so far — not only those completed after
      the reload.
- [ ] Selecting a hand opens the scrub: a ticked track with heavier street
      boundaries, street chapters that seek to each street's `BoardDealt`
      (the flop cards are *seen arriving* when "Flop" is tapped), a draggable
      thumb, and autoplay available but off by default.
- [ ] The felt at a position shows per-seat action labels for the current
      street only, and the caption strip names the beat — with no event
      ordinal anywhere on screen.
- [ ] A hand ending in **fold-out** replays correctly, board and all — the
      case a terminal view cannot express.
- [ ] Starting a hand while a review is open **force-dismisses it
      immediately**, with no confirmation, and the felt is the live board
      again.

**The standing guarantee**

- [ ] Phase 1's fast-check secrecy property test passes **unchanged**, and no
      replay path anywhere accepts a `revealEverything` flag, audience
      argument or redaction option.
- [ ] No folded seat's hole cards are visible at any position of any replay,
      to the table or to any phone.
