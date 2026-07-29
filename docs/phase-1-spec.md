# Phase 1 build-ready specification

Assembled from the [wayfinder map](https://github.com/ewanhardingham/table-top-poker/issues/1)
that closed every foundational decision below. This document gathers those
decisions into one place a build session can work from without re-deriving
anything. Where a decision needs its full rationale, the link goes to the
ticket that made it — this document states *what*, the ticket holds *why*.

Vocabulary is defined once, in [`CONTEXT.md`](../CONTEXT.md), and used
without redefinition here.

## 1. Scope

**Phase 1 destination**: a playable, correct Texas hold'em table across one
central device (the table) and several player phones, dealing cards only.
No chips, no stakes — physical chips move on the table and the humans are
trusted.

**In scope**:

- Full hold'em rules: blinds, streets, betting rounds, showdown, hand ranking,
  split pots by rank (not by chip value — there's no chip value yet).
- Room creation, joining by QR/room code, seat claiming, reconnection.
- A pure, replayable, unit-testable engine with per-seat visibility.
- A JSON-lines harness as a first-class way into the engine.
- Deployment onto a home LAN box (Raspberry Pi class hardware).

**Out of scope** (see the map's Out of scope section for the full rationale
on each):

- Chips, stacks, pot and side-pot tracking, all-ins — Phase 4, and
  conditional even then.
- Tactile card interactions (peel-back, swipe-to-fold, animation) — Phase 3.
  Phase 1's UI is tap-a-button; the frontend choice must not preclude Phase 3,
  but building it is not this phase's job.
- Replay and audit tooling (browsing/stepping through recorded hands) —
  Phase 2. Phase 1 writes the log; it does not read it back.
- Public internet deployment, accounts, authentication — later. Phase 1 is
  LAN-only, no auth, bearer-secret trust model throughout.
- Poker variants other than Texas hold'em, and multiple simultaneous tables.
- Full recovery of a live room from the on-disk log after a server-process
  restart. The only recovery Phase 1 attempts is the table device's socket
  reconnecting within a 60-second grace window (§8) — a full process restart
  mid-hand loses the in-memory room; the hand's log on disk is untouched but
  nothing rebuilds a live room from it. (This was open fog on the map;
  [Rooms, identity, seat claiming and reconnection](https://github.com/ewanhardingham/table-top-poker/issues/13)
  already fixes recovery scope this tightly, so it's a consequence of a
  closed decision, not a new one.)
- The table device acting as a seated player. Role is fixed by how a device
  arrives — "Create room" makes it the table, "Join room" makes it a seat —
  never inferred from hardware and never both
  ([Rooms, identity, seat claiming and reconnection](https://github.com/ewanhardingham/table-top-poker/issues/13)).

**Roadmap beyond Phase 1** (order, not detail —
[Phase roadmap beyond Phase 1](https://github.com/ewanhardingham/table-top-poker/issues/5)):
this vertical slice → replay/audit tooling → tactile card interactions →
chips and betting (conditional) → beyond.

## 2. Domain vocabulary and hand lifecycle

Defined in full in [`CONTEXT.md`](../CONTEXT.md)
([Domain glossary and the hand lifecycle state machine](https://github.com/ewanhardingham/table-top-poker/issues/2)).
Summary of the nouns a build session needs on first read:

- **Room** — persistent session above a Hand; hosts one Table (a device
  *role*, not a state holder) and up to **8** seated Players.
- **Player / Seat / Device** — three distinct nouns. Device (live socket)
  authenticates as Player (persistent identity), which occupies a Seat
  (positional, persists across hands and across disconnects). This
  separation is what makes clock-driven auto-fold survive reconnection.
- **Hand** — a seed plus an ordered command list; born and ends inside a
  Room's lifetime.
- **Action / Actor / Command** — a completed decision, the player whose turn
  it is, and the proposed input before validation, respectively. Matches
  `decide(state, command) -> Event[] | Rejection`.
- **Button / Small Blind / Big Blind** — positional Seat labels; the engine
  never tracks a chip *amount* (players post real blinds at the physical
  table). Preflop *legality* still mirrors that post: every Seat but the BB
  faces a bet (call/fold/raise, not check) until a raise or the BB's option
  (ADR-0001).
- **Heads-up** (2 live players) is in scope: Button acts as Small Blind,
  first preflop, last on every later street.

**Hand lifecycle** (state machine, full diagram in `CONTEXT.md`):

```
[Room: seated, awaiting hand]
  → DEALING_HOLE → PREFLOP → FLOP → TURN → RIVER
  → SHOWDOWN → HAND_COMPLETE → [Room: seated, awaiting hand] (button rotates)
```

Early-out: from any betting street, a fold that drops live players to 1
jumps straight to `HAND_COMPLETE` — no showdown, no reveal. Street closure
is last-aggressor logic: a street ends once every live player has acted
since the most recent bet/raise and none still owes a response.

## 3. Engine

**Purity** (standing map constraint): no I/O, no clock, no ambient
randomness. Shaped as `decide(state, command) -> Event[] | Rejection` and
`apply(state, event) -> state`. The shuffle seed is always caller-supplied —
CSPRNG at the server, explicit in a test or harness invocation.

### Commands
([Engine command, event and rejection protocol](https://github.com/ewanhardingham/table-top-poker/issues/9))

No uniform envelope — each type declares its own fields:

- `{ type: 'startHand', playerId, seed }` — no issuer restriction at the
  engine level; table-device-only is enforced at the server/UI layer.
- `{ type: 'fold' | 'check' | 'call' | 'raise', playerId }` — engine
  validates `playerId` is the current Actor.
- `{ type: 'nextHand', playerId, seed }` — dismisses the showdown reveal and
  starts the next hand in one step; carries the new seed.

No `advance` command. Ordinary street transitions auto-cascade within the
same `decide` call that closes the prior street. The only explicit
human-paced step is showdown → next-hand, via `nextHand`.

### Events

Always the full, unredacted truth — secrecy lives solely in `view`, never
in event redaction. Full Phase 1 event set:

```ts
type HandEvent =
  | { type: 'HandStarted'; seed: string; button: SeatId }
  | { type: 'HoleCardsDealt'; deals: { seatId: SeatId; cards: [Card, Card] }[] }
  | { type: 'StreetStarted'; street: 'preflop' | 'flop' | 'turn' | 'river'; actor: SeatId }
  | { type: 'ActionTaken'; seatId: SeatId; action: 'fold' | 'check' | 'call' | 'raise' }
  | { type: 'StreetClosed'; street: Street }
  | { type: 'BoardDealt'; street: 'flop' | 'turn' | 'river'; cards: Card[] }
  | { type: 'HandFoldedOut'; winner: SeatId }
  | {
      type: 'ShowdownReached';
      results: {
        seatId: SeatId;
        rank: HandRank;
        bestHand: [Card, Card, Card, Card, Card];
        description: string;
      }[]; // live seats only — folded players are never revealed, even at a normal showdown
      winners: SeatId[]; // split-aware
    }
  | { type: 'HandComplete' };
```

`SeatId` and `Card` are stable identities in the wire contract (never an
array index) — required so Phase 2/3 client animations can key off identity
and settle rather than flicker
([cross-cutting constraint from the gesture research](https://github.com/ewanhardingham/table-top-poker/issues/8)).

### Rejections

A typed value, `{ type: 'Rejection', reason, command }` — never thrown,
never itself an `Event`. Preserved in the server's raw log alongside
accepted commands for audit completeness, but never processed by `apply`.
Sequencing and replay-resistance are server/transport concerns, not engine
concerns.

### Hand evaluation
([Research: hand evaluation](https://github.com/ewanhardingham/table-top-poker/issues/6),
full findings in `docs/research/hand-evaluation.md`)

Built in the engine, **zero runtime dependencies**. Exhaustive enumeration
over all 133.8M seven-card hands runs in ~17s in CI, so correctness is
proven over every input the evaluator will ever see rather than sampled.
`phe` is a dev-only test oracle, never a runtime dependency — no third-party
library supplies comparable rank, winning five cards, and a readable
description together.

### JSON-lines harness

Line-delimited commands in via stdin, line-delimited events/rejections out
via stdout, folding each event into state via `apply` as it's produced. A
recorded hand *is* its input command stream (not the output); replay means
re-piping that file and diffing the resulting output against a previously
captured one. This is both the audit mechanism and a regression-test
fixture, and works with no frontend and no server — a hand can be played
from a terminal, a test, or an agent.

## 4. Visibility and secrecy
([Per-seat visibility and hole-card secrecy](https://github.com/ewanhardingham/table-top-poker/issues/11))

`view(state, seatId)` lives in the engine, not the API layer, so secrecy is
provable in a unit test.

- **The table device is no more privileged than any player.** It gets its
  own `view(state, 'table')`, equally restricted — never holding a hole
  card value it isn't entitled to.
- **`PlayerView` and `TableView` are distinct types** with no field capable
  of holding another seat's hole cards pre-showdown. A leak is a
  compile-time type error, not an unpopulated runtime field. Other seats'
  cards only appear once attached to a live seat's result inside the
  showdown-phase variant.
- **Folding is a burn-pile, not a private muck.** Once a seat folds, `view`
  stops showing that seat *its own* hole cards too, mirroring a dealer
  physically removing folded cards from play. (The phone already received
  the actual card values at deal time for the Phase 2 peel gesture — this
  is the authoritative view withdrawing them going forward, not erasing
  device memory. Client UI is expected to honor the withdrawal.)
- **Folded players are never revealed, even at a normal showdown** —
  `ShowdownReached.results` is scoped to live seats only.
- **The remaining deck order is never reachable** from any view or event.
- **The raw event log is server-side only** in Phase 1 — no client-facing
  read path (API, socket, or download), for the table device or anyone
  else. Phase 2's audit/replay tooling designs its own access story from
  scratch; this makes no forward promise.

**Proof strategy**: a fast-check property test as the primary guarantee —
generate arbitrary hand states and arbitrary seat ids, assert `view` never
contains a `Card` belonging to another seat unless that seat appears in a
completed `ShowdownReached`. Backed by hand-written unit tests for specific
scenarios (own cards visible, opponents hidden mid-hand, folded seat's own
cards hidden, table view sees no hole card pre-showdown, all live cards
visible post-showdown).

Hole cards are pushed to their owning device the moment they're dealt
(`HoleCardsDealt`), not fetched later at reveal — required so Phase 2's peel
gesture is a client-side reveal of data the phone already holds, never a
network round trip.

## 5. Persistence and replay
([Event log, persistence and replay guarantees](https://github.com/ewanhardingham/table-top-poker/issues/10))

- **What's stored**: both the seed + ordered command list (ground truth for
  replay) and the resulting event stream (human-readable audit trail), per
  hand. No state snapshots — a hand is small enough that replaying from
  scratch is always cheap.
- **Where**: plain JSON Lines files on disk, partitioned by game and by
  hand — the exact stream the §3 harness already reads and writes. No
  database for Phase 1; revisit alongside a later web deployment.
- **Write timing**: append-as-you-go, not buffered-and-flushed-at-completion.
  Consequence: the seed is visible on disk from the moment a hand starts —
  a theoretical live-cheating vector, accepted given the home-LAN trust
  model, and preferable to losing an entire hand's log to a mid-hand crash.
- **Replay guarantee**: bit-identical only *within a matching engine build*.
  Each log record carries a version tag; replaying against a later build
  with a changed shuffle or event shape is not guaranteed bit-identical.
  Old logs stay interpretable against the build they're tagged with — no
  migration required.
- **Retention**: keep everything, forever. No rotation or size cap for
  Phase 1.

## 6. Transport and wire contract
([Transport and server framework](https://github.com/ewanhardingham/table-top-poker/issues/12))

- **Transport**: raw WebSockets (Node's `ws`) — not Socket.IO, not
  SSE+POST. A library's automatic reconnect/heartbeat would paper over
  connection drops, and the auto-fold rule needs "disconnected" to be
  visible and honest.
- **HTTP framework**: Fastify, plus `@fastify/websocket` so the WS upgrade
  shares the same server/port as the thin route layer (static files, room
  create/join, QR code).
- **Message direction**: every server→client message carries **both** the
  raw domain event (for audit/animation) **and** a fresh
  `view(state, seatId)` snapshot, with **the view as source of truth** — a
  client self-corrects from the next snapshot even if it mishandles an
  event.
- **Wire contract integrity**: shared TypeScript types live in the
  `protocol` package. Incoming commands are validated at runtime with
  **Zod** at the server boundary — the one seam where an untrusted device's
  JSON crosses into the pure engine. Outgoing messages aren't validated;
  they're trusted by construction.
- **Command delivery**: explicit ack/reject per command, reusing the
  engine's `Rejection` type — never inferred from an absent state change.
  Delivery is per-connection, so a rejection is only ever visible to the
  player whose command it rejects — the table device and other players see
  nothing; no separate broadcast message shape is needed
  ([Rejection surfacing](https://github.com/ewanhardingham/table-top-poker/issues/17)).
- **Rejection reason**: `Rejection.reason` is a closed, engine-defined set
  of reason codes, not a free-text string — keeps display copy out of the
  engine and makes client handling exhaustively checkable by the
  switch-exhaustiveness lint (§10). Phase 1 starter set, extensible:
  `not-your-turn`, `action-not-legal`, `hand-not-in-progress`,
  `hand-already-in-progress`, `stale-next-hand`
  ([Rejection surfacing](https://github.com/ewanhardingham/table-top-poker/issues/17)).
- **Reconnect / catch-up**: one fresh view snapshot, not event replay —
  consistent with the view being source of truth.
- **Connection identity**: room and player travel as query-string params on
  the WebSocket URL at connect time. A bad room/player is rejected at the
  HTTP upgrade itself, before a socket opens.
- **Scheme**: derive the WebSocket scheme from `location.protocol`, never
  hard-code `ws://`, so a later move to HTTPS is a non-event.

## 7. Rooms, identity, reconnection
([Rooms, identity, seat claiming and reconnection](https://github.com/ewanhardingham/table-top-poker/issues/13))

- **Room codes**: 4 characters, confusable-excluded alphabet (digits +
  uppercase, excluding `0/O`, `1/I/L`, `2/Z`, `5/S`, `8/B`) — 25 characters,
  25⁴ ≈ 390K combinations, re-rolled on collision against live in-memory
  rooms. No
  independent expiry; a code lives as long as its room.
- **Joining**: by QR code generated live from the current address, plus the
  room code as fallback for anyone who can't scan.
- **Role declaration**: explicit **"Create room" / "Join room"** buttons on
  landing — never inferred from device type.
- **Room lifecycle**: created the instant "Create room" is pressed; stays
  joinable, including mid-hand, for its entire life. Ends via an explicit
  **"End session"** button, or the table device's socket failing to
  reconnect within a **60-second grace window**. Either path notifies all
  players and discards in-memory state; hand logs already on disk are
  untouched.
- **Seat claiming**: max **8 seats**, player-chosen (a picker of free seats
  after entering/scanning the room code), not assigned. A vacated seat can
  be reclaimed by a new joiner. Joining mid-hand is allowed — a new device
  claims any empty seat, shown as "sitting out" while occupying it, dealt
  in starting the next hand.
- **Identity across reconnect**: on seat claim, the server issues an opaque
  per-seat token stored in the phone's `localStorage`, sent as a WebSocket
  connect-time query param on reconnect. Cleared storage means no automatic
  reclaim — the orphaned seat behaves like any disconnected player. A
  handed-over phone inheriting a seat is a known, accepted gap for Phase 1.
- **Disconnect detection**: WebSocket ping every 10s; a seat is marked
  "disconnected" (a cosmetic table-device badge only) after 2 missed pongs
  or the socket closing. **This is a presence signal only, fully decoupled
  from folding.** Folding stays strictly clock-driven per the map's standing
  rule — a locked phone dropping its socket must never fold that player;
  only the action clock does.
- **Reconnecting before their turn**: silent, free, no penalty.
  **Reconnecting after auto-fold already fired**: they land in a folded
  seat for the rest of that hand (folding is a burn-pile — no cards
  restored) and rejoin normally next hand.
- **Security model**: no auth, no rate-limiting — room codes and seat
  tokens are accepted bearer secrets, consistent with the trusted-home-LAN
  model. The real perimeter is keeping strangers off the network at all.
- **Seat eviction** ([Seat lifecycle: disconnected sit-out and eviction
  after missed hands](https://github.com/ewanhardingham/table-top-poker/issues/56),
  [ADR-0002](adr/0002-seat-eviction-clocks-on-missed-hands.md),
  [ADR-0003](adr/0003-eviction-is-a-manual-table-action.md)): a seat has
  four states — **active**, **sitting-out** (voluntary, player-toggled,
  never dealt in), **disconnected** (the existing presence signal above,
  unchanged — a hand already in progress still folds via the action clock,
  never the socket; from the *next* hand onward, a disconnected seat is
  skipped like a sit-out), and **evicted**. Eviction is a manual table
  action, not automatic — the table device can evict any claimed seat
  (active, sitting-out, or disconnected) at any time; there is no
  missed-hands counter or threshold. On eviction: the seat's token is
  invalidated server-side, the seat is freed into the join picker, and the
  eviction is broadcast to the table.

## 8. Deployment
([Research: hosting on a Pi](https://github.com/ewanhardingham/table-top-poker/issues/7),
full findings in `docs/research/pi-hosting-and-lan-https.md`)

- **Plain HTTP over a LAN IP, no certificate.** A private LAN IP isn't a
  secure context, but nothing Phase 1 needs (WebSockets, fetch,
  `localStorage`, IndexedDB, `crypto.getRandomValues`, fullscreen) is gated
  by that.
- **Reached by a QR code generated live from the current address** — see §7.
- **Served by Node under systemd** on a 64-bit Raspberry Pi (or similar
  always-on box), with a **DHCP reservation** so the address is stable
  between reboots.
- **Guest Wi-Fi AP client isolation is the single most likely thing to ruin
  poker night** — everyone must be on the main SSID, not an isolated guest
  network.
- If HTTPS is ever required later (e.g. because installable/standalone mode
  turns out to matter — see §9), the ranked answer is a publicly-trusted
  certificate on a real domain resolving to the private IP via DNS-01 ACME.
  Tailscale needs an app on every guest phone; mkcert needs a CA install per
  iOS device; Let's Encrypt refuses certs for RFC1918 address space.

## 9. Clients
([Frontend framework and client architecture](https://github.com/ewanhardingham/table-top-poker/issues/14),
research in `docs/research/frontend-gesture-stack.md`)

- **Framework**: React + Motion (`motion/react`) + `@use-gesture/react`, a
  plain Vite SPA, cards as DOM elements — no canvas/WebGL. Tie-breaker was
  Motion's `layoutId` for cross-tree shared-element animation (a card
  leaving a hand and becoming a card on the board), needed for Phase 3 and
  absent from other frameworks' first-party tooling. This choice shapes
  Phase 3's feel, not Phase 1's correctness.
- **Two separate apps**: `table-client` and `player-client` stay distinct
  Vite SPAs — the screens barely overlap (board + every seat's status vs.
  one player's hand + their own actions).
- **Shared UI**: a `ui-shared` workspace package, holding primarily
  `<Card>` (built with rank/suit/face-down props from the start — never an
  `<img>` swapped between two sources).
- **Client state**: Zustand, sliced so a mid-drag server push (relevant from
  Phase 3 onward) doesn't re-render the whole screen. Each client's job is
  to replace its local slice with the latest `view` snapshot the server
  pushed — the view is source of truth (§6), Zustand's slicing is what
  keeps that replacement cheap.
- **Disconnected rendering**: keep showing the last known view, no blocking
  overlay — a small, non-blocking connection-status indicator instead. On
  reconnect, the fresh `view` snapshot silently replaces local state (if it
  now shows the player folded because auto-fold elapsed while away, that's
  just what renders next — no special messaging).
- **Action-intent module** (`player-client`, binding for Phase 1): one
  module exposing `fold()`, `check()`, `call()`, `raise()`, plus a derived
  `legalActions`. Buttons are the **permanent** base layer — Phase 3's
  gestures supplement, never replace them. A sent-but-unacknowledged action
  renders as `pending` locally until the server's ack/reject lands. On
  reject, the control that triggered the command shows the failure
  **inline**, reverting `pending` to idle, and clears on the player's next
  legal action or the next `view` snapshot — no toast, no persistent banner
  ([Rejection surfacing](https://github.com/ewanhardingham/table-top-poker/issues/17)).
- **App shell**: non-scrolling, fixed, sized in `svh` (`overflow: hidden`,
  `viewport-fit=cover`, `env(safe-area-inset-*)`) — page scroll under a
  drag can't be prevented after the fact, so it's designed out from the
  start. `touch-action: manipulation` on the base stylesheet removes iOS
  Safari's 350ms tap delay.
- **PWA install / standalone mode**: not pursued in Phase 1 — it needs a
  secure context, which §8 rules out. If home-screen install later turns
  out to matter to the feel of the player device, that reopens the
  certificate question in §8; it does not block Phase 1 as specified.

### What each screen shows

**Table device** (`table-client`)

- The board: community cards as they're dealt, every seat's status (in
  hand / folded / disconnected-badge / sitting out), whose turn it is, the
  button position.
- On showdown: the winning hand(s), each live seat's rank and best five
  cards, split-aware.
- A **"Next hand"** button, appearing only once `HAND_COMPLETE` is reached.
- A **"Create room" / "End session"** control and the join QR code /
  room code, shown before a hand is running or between hands.
- **No rejection rendering** — a rejected command is only ever visible to
  the player who sent it (§6), so the table device shows nothing for it
  ([Rejection surfacing](https://github.com/ewanhardingham/table-top-poker/issues/17)).

**Player device** (`player-client`)

- Own hole cards, revealed on deal (not fetched later), hidden again once
  folded (burn-pile, §4). The shared board is deliberately *not* shown
  during betting — that's the table device's job, and mirroring it on the
  phone too was redundant screen clutter — but it does reappear on the
  showdown screen, alongside each winning seat's revealed hand.
- The permanent action-intent buttons, restricted to `legalActions` for the
  current state, with `pending` styling while a sent action awaits
  ack/reject.
- Seat-claim picker on join; a "sitting out" indicator if joined mid-hand
  and not yet dealt in.
- A small, non-blocking connection-status indicator (§9, disconnected
  rendering).
- Inline rejection feedback on the control that triggered a failed action
  ([Rejection surfacing](https://github.com/ewanhardingham/table-top-poker/issues/17)).

### Players are identified to each other by seat position only

No name, colour, or avatar field exists anywhere in the wire contract (§3,
§6) — adding one would be a protocol change, not a Phase 1 default. This
was open fog on the map with no decision recorded; the default carried into
Phase 1 is the null option: a seat number/position is the only identifier,
consistent with `SeatId` already being the sole per-seat identity in every
event and view. If table talk (nicknames, colours) turns out to matter, that's
a small, additive protocol change for a later phase — not a gap in this one.

## 10. Repository, tooling and process
([Repository structure and build tooling](https://github.com/ewanhardingham/table-top-poker/issues/3),
[Development workflow, CI and testing strategy](https://github.com/ewanhardingham/table-top-poker/issues/4))

- **Layout**: monorepo, npm workspaces. Packages: `engine`, `protocol`
  (shared wire-contract types), `server`, `table-client`, `player-client`,
  `ui-shared`. Dependency direction enforced structurally — `engine`
  depends on nothing else in the repo, so the purity constraint can't be
  violated by a stray import.
- **TypeScript**: one shared strict `tsconfig.base.json` (`strict`, plus
  `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`), via TS project references (`composite: true`) —
  same bar for every package, no per-package loosening.
- **Tests**: Vitest everywhere; fast-check for property-based tests within
  Vitest files.
- **Lint/format**: Prettier (default settings); ESLint with
  `typescript-eslint` strict + stylistic type-checked configs, including
  switch-exhaustiveness rules on discriminated unions.
- **Node 22**, pinned via `.nvmrc`, `package.json` `engines`, `.npmrc`
  `engine-strict=true`.
- **CI**: one GitHub Actions job, no matrix — `npm ci`, lint + Prettier
  check, cross-package `tsc` build, `vitest run`. Required to merge.
- **Branching**: all work through PRs, even solo — the review gate matters
  because agents author most of the diffs. Agents open PRs autonomously
  against `ready-for-agent` issues but never merge their own; merge is
  always human.
- **Test rigor by package**: TDD (red-green-refactor) required specifically
  for `engine`. Elsewhere, tests are required but not strictly test-first.
  fast-check is mandatory for the hand evaluator and any engine invariant
  with a clear property (e.g. same seed → same deal; a rejected command
  never mutates state). No coverage-percentage gate. Playwright for
  critical frontend paths is anticipated but deliberately deferred.
- **ADRs**: written only for architecturally-significant decisions made
  *after* this map closes — while the map was open, its tickets were the
  decision record (this document is their synthesis, not a duplicate of
  it).
- **Day-to-day tracker**: GitHub issues with the existing five triage
  labels (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`,
  `wontfix`), unchanged, once the map closes.

## 11. Acceptance

Phase 1 is done when all of the following are demonstrably true, in one
sitting, on real devices at a real table:

- [ ] The table device creates a room; its QR code is scanned successfully
      by a phone on the **main** SSID (not an isolated guest network).
- [ ] At least 3 phones claim distinct seats via the picker; the table
      device shows all claimed seats before the first hand starts.
- [ ] A hand is started with a live seed; each phone shows **only its own**
      hole cards — never another seat's, at any point before showdown.
- [ ] A full betting round completes on every street (preflop through
      river) with fold/check/call/raise all exercised at least once, and
      street closure correctly waits for every live player to act since the
      last bet/raise.
- [ ] At least one hand ends by **fold-out** before river — no showdown, no
      reveal, and the table device moves straight to `HAND_COMPLETE`.
- [ ] At least one hand reaches **showdown** — the table device displays
      the winning hand(s), each live seat's best five cards and rank, and a
      split is correctly reported if hands tie.
- [ ] Pressing **"Next hand"** on the table device rotates the button and
      starts a new hand with a fresh seed.
- [ ] One phone is **locked mid-hand** (screen off, socket drops) when it
      is *not* that player's turn, and the player is **not** auto-folded —
      the fold only fires later, when the action clock reaches them without
      a response.
- [ ] The completed hands are present on disk afterward as JSON Lines files
      (seed + command list, and event stream), and replaying one through the
      harness reproduces the same event stream.
