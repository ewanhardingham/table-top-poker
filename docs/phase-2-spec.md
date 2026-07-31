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

**Phase 1 does not persist a live Room at all.** This is the single most
important premise correction on the map, and it is worth stating plainly
because both `docs/phase-1-spec.md` §5 and the Phase 2 map's own opening
assumed otherwise. The log writer `HandLog` lives in
`packages/harness/src/persistence.ts` and is used only by the harness CLI;
`packages/server` has no `harness` dependency and performs no filesystem
write of any kind. Phase 1 specified persistence and shipped it in the
harness only.

So Phase 2 opens a read path **and** a write path. The write path is the
larger of the two.

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
opt-in, opt-out, or mid-Room toggle. Raw recordings remain local and
unredacted; player-facing replay passes through the table-safe projection of
§4–§5. Phase 1's keep-everything-forever retention remains binding.

A new **`@table-top-poker/recording` workspace package** owns the durable
format. Both `server` and `harness` depend on it; it depends only on engine
types. The pure engine keeps all filesystem I/O out. This replaces the
misleading harness-owned `HandLog` rather than making production depend on
the developer CLI.

### Durable identity and layout

A Room receives an opaque UUID **Room ID** at creation, distinct from its
four-character live join code. Its directory is
`<RECORDINGS_DIR>/<room-id>/`; `RECORDINGS_DIR` defaults to `./recordings`.
Server startup creates and verifies that root and **fails to start** if it is
not writable. The harness retains its explicit `--log-dir` option.

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

- **`room.json`** is immutable metadata: `v`, `roomId`, `code`, `createdAt`.
  It is *not* a fixed Seat manifest. Seat claims, evictions, presence and
  sitting-out transitions are not separately recorded.
- **`hand-NNNN.context.json`** is an immutable single JSON document: `v`,
  `roomId`, `handOrdinal`, `startedAt`, participating `seats`, starting
  `button`. It contains **no cards and no state snapshot**. The dedicated
  context sidecar is what leaves the Command JSONL as an exact Command-only
  stream.
- **`hand-NNNN.commands.jsonl` / `hand-NNNN.events.jsonl`** carry the exact
  engine Command stream and the resulting Event/`Rejection` stream.

Commands and Events remain **untimestamped**, so Replay position stays an
Event ordinal (§2). `startedAt` on the Hand context is the only clock in the
recording, and it exists because the picker needs it (§6).

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

`RoomStore` (`packages/server/src/rooms.ts`) owns **one operation queue per
Room** and is the commit seam for gameplay. Socket Commands, clock-driven
folds and Seat mutations enter it in arrival order. Dispatch stages an engine
transition *without changing live state*, awaits `recording.append()`, then
commits and returns broadcast steps. A clock fold carries its expected Actor
and is re-checked when its queued turn arrives. Other Rooms remain
independent.

### Recording-paused: recoverable failure

A failed append **does not end the Room and never permits unrecorded play**.
It cancels the action clock, retains the failed operation, and puts that Room
into a blocked **recording-paused** state.

- Existing sockets stay connected; existing identities may reconnect and
  receive the last committed view; presence may continue changing.
- Gameplay, new Seat claims, eviction and sitting in/out are rejected with a
  `recording-paused` reason code.
- Only the table may choose **Retry recording** or **End session**.
  Filesystem details stay in operational server logs.
- **Retry** truncates affected files to their last confirmed offsets, appends
  the retained operation again, and only then commits/broadcasts it and
  restarts the Actor's clock with a **fresh** interval.
- **Ending a paused Room** discards the uncommitted operation after restoring
  parseable confirmed tails.

Normal Room ending and `SIGINT`/`SIGTERM` stop new operations, drain the
active operation, restore confirmed tails if paused, close recording handles,
then remove the Room or exit. `SIGKILL` may still leave one torn final
record, handled by the incomplete-Hand rule in §4.

### Version tagging

This is **recording format version 2**: the manifest, context, Commands,
Events and Rejections all carry `v: 2`.

There is **one** version number, not two. `ENGINE_LOG_VERSION`
(`packages/engine/src/version.ts`, currently `1`) is the tag every record
already carries, and it becomes `2` as part of this work — §4's rule that
every record must carry the running engine's `ENGINE_LOG_VERSION` and §3's
`v: 2` are the same tag, not a format version layered over an engine version.
A build session must not introduce a second version field.

There is no version-1 migration: the server produced no version-1 Room
recordings, and disposable harness development runs may be cleared during
implementation. A version-1 file requires its matching older build.

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

Every supplied manifest/context, Command, Event and `Rejection` record must
carry the running engine's `ENGINE_LOG_VERSION` (§3). Any mismatch is an
immediate **unsupported-version failure** reporting expected version, actual
version, file and record. Phase 2 has no migration, guessing or force
override; an old log requires a compatible build.

The I/O adapter may discard **exactly one clearly torn final JSONL record**
and mark the replay **incomplete**, reporting its file and line.

- The dev stepper may show the recoverable complete prefix with a warning
  (§7).
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

**The whole hand arrives in one response.** A hand is small — the same size
class as a live `HandUpdateMessage` repeated a few dozen times — and the
scrub (§6) needs every position up front to lay out its ticked track and
street chapters, so partial delivery buys nothing.

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
- the **betting shape** — the public `ActionTaken` sequence, or a phrase
  derived from it server-side;
- the **outcome**, including showdown reveals.

The server pushes a new summary **right after each hand completes** — the
same moment "Review hands" becomes reachable (§6). The picker therefore opens
instantly on an already-accumulated list, and each summary is folded from the
Event stream once, while state is warm, rather than re-derived on demand.

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
- **Betting shape** — a phrase derived from public `ActionTaken` events:
  *walk — folded round*, *preflop raise took it*, *checked down*, *one
  raise*, *raise war — 4 raises*.
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

**Known seam**: `Board`'s per-card entry animation is keyed on mount, so the
stage remounts it per position to make a `BoardDealt` read as a *deal* rather
than as cards that were suddenly always there. That works for stepping and
autoplay but re-fires the animation on every scrub tick. A build session
should expect to resolve this properly — key the animation on card identity
rather than remount.

## 7. The dev stepper CLI
([Dev stepper CLI surface](https://github.com/ewanhardingham/table-top-poker/issues/84))

**Non-interactive by design.** Agents author most of the code in this repo,
so a tool an agent can drive and diff beats an interactive TUI it cannot.

### Command and addressing

The dev stepper is the `replay` subcommand of the existing `harness` binary.
The current stdin/stdout harness mode remains backward-compatible; Phase 2
adds no second executable.

```sh
harness replay <room-directory> --hand <hand-ordinal>
harness replay <room-directory> --hand <hand-ordinal> --at <event-ordinal>
harness replay <room-directory> --hand <hand-ordinal> --from <n> --to <m>
```

The positional directory is one Room recording in the version-2 layout (§3).
With no position selector the command emits the whole Hand; `--at` emits one
position; `--from`/`--to` are a paired, inclusive range.

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
   §5's persistence section specify a write path that shipped only in the
   harness. Corrected in place with a pointer to §3 here, which delivers it.
3. **One version number, not two.** §3 above reconciles #86's "recording
   format version 2" with #80's "must carry the running engine's
   `ENGINE_LOG_VERSION`" — they are the same tag, and `ENGINE_LOG_VERSION`
   moves `1 → 2`.

Also note: the `prototype/hand-picker` branch carries **Phase 1 visual fixes**
to `TableControls` and `PillButton` (rail grouped into one fixed-width column,
both pill tones rendering their label as authored), and
`prototype/replay-transport` carries a **`Board` fix** (cards keyed by
rank+suit with the per-phase branches unified, so crossing betting → showdown
no longer re-deals all five cards) plus an optional `StatusBar` `leading`
slot. None of these are replay-specific; they belong to
[map #57](https://github.com/ewanhardingham/table-top-poker/issues/57) and are
currently only on prototype branches.

## 9. Acceptance

Phase 2 is done when all of the following are demonstrably true, in one
sitting, on real devices at a real table.

**The write path**

- [ ] Creating a Room produces `<RECORDINGS_DIR>/<room-id>/room.json` before
      the join code or QR is shown; a non-writable `RECORDINGS_DIR` prevents
      the server from starting at all.
- [ ] Playing several hands produces one
      `context.json` / `commands.jsonl` / `events.jsonl` triplet per hand,
      every record tagged `v: 2`, with no timestamps on Commands or Events.
- [ ] A rejected command appears in the hand's `events.jsonl` as a
      `Rejection`, and does not advance the Event ordinal.
- [ ] Inducing an append failure puts the Room into **recording-paused**:
      sockets stay up, gameplay is rejected with `recording-paused`, the
      action clock is cancelled, and **Retry recording** on the table resumes
      play with a fresh clock and a correctly-truncated, valid file tail.

**Replay and the dev stepper**

- [ ] `harness replay <dir> --hand N` emits one JSONL position per Event
      ordinal, exits `0`, and re-running it byte-identically diffs clean.
- [ ] `--at` and `--from`/`--to` select correctly, and `--at N` also emits
      every Rejection that occurred at position N.
- [ ] Truncating the last line of an `events.jsonl` yields the complete
      prefix on stdout, an `incomplete-hand` warning on stderr naming file
      and line, and exit `2`.
- [ ] Corrupting a *non-final* record, or making a persisted Event disagree
      with the replayed one, yields **no stdout records**, a diagnostic
      naming the first differing record, and exit `1`.
- [ ] A record carrying `v: 1` yields an unsupported-version diagnostic
      naming expected and actual version, file and record — and exit `1`.

**The table review**

- [ ] **Review hands** appears in the table control rail only between hands,
      and is not reachable while a hand is in progress.
- [ ] The picker lists the session's completed hands newest-first, each row
      showing board (with dashed empties for undealt streets), survivors and
      street, betting shape, outcome, button seat, and a relative start time
      that **visibly re-ticks** while the picker stays open.
- [ ] An incomplete Hand recording is **not** offered in the picker.
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
