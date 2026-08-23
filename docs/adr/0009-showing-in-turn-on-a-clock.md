# 0009 — Showing at showdown happens in turn, on a clock

## Status

Accepted. Supersedes the Decision section of
[ADR-0008](0008-showdown-visibility-is-engine-state.md), whose thesis — that
showdown visibility is engine state — this decision keeps and builds on.
Depends on [ADR-0007](0007-all-in-as-declared-actions-without-chip-values.md)
for the all-in actions it tables at the window's opening.

## Context

ADR-0008 made showing engine state, but modelled the act as a table press: the
table's `reveal` turned over a compulsory set and published the winners, after
which any contestant could `show`, in any order, for as long as the room left
the hand up. That is not what a room does. A real showdown rests, and each
contestant in turn either tables their cards or mucks them; nobody at the table
presses anything to start it.

Three things followed from the press. Nobody could muck, so a losing hand had
no way to decline — the concept did not exist in the engine at all. Order did
not exist either, so the room had no answer to "whose turn is it", and the
device could not tell a player when to act. And the compulsory set was computed
at the press, which made the winning seat compelled where the river checked
through: the table would announce, before any card was turned, which seat held
the best hand.

The `reveal` press also had nothing left to do. Its two jobs — opening the
window and publishing the winners — both belong to the hand's own progress:
river close is the opening, and the queue emptying is the publication.

## Decision

**The window opens by itself, and the `reveal` command is deleted.** River close
opens it. Every contestant's hole-card pair resets face-down as it opens, so the
flip that publishes (ADR-0008's amendment for #253) is always a deliberate act
taken with the window already open.

**All-in contestants are tabled by the engine at that instant.** Their hands
were decided streets ago and they have no decision to make. Every other
contestant enters a queue, ordered: the river's last aggressor first; if the
river checked through and there is no aggressor, the first live seat left of the
button; then clockwise. If every contestant is all-in the queue is empty at the
opening and the winners publish immediately.

**Two acts, gated to the head of the queue.** A committed peel face-up is the
`show`. The same upward fold-drag that folds during betting is the new `muck`.
Anything from any other seat is rejected. The bend-to-peek stays live for every
contestant throughout: the wait before your turn is exactly when someone wants a
last look at what they are about to muck.

**Compulsion is a property of the window, not of a seat.** Until some hand is
face-up, the head of the queue cannot muck. The first hand face-up discharges
it, and every remaining contestant may then muck freely — including one holding
the winning hand who has misread the board. This is the departure from ADR-0008
noted above: the compelled seat is the first-to-act left of the button, never
the winning seat.

**Winners are the best shown hand.** Mucking forfeits, full stop. Winners are
computed over `results` only, and published only once every contestant has
shown or mucked. `nextHand` and `startHand` are rejected while the queue is
unresolved, in the engine rather than by greying out a control, because
ADR-0008's thesis is that showdown visibility is engine state.

**The window runs on a clock, and the engine keeps no notion of time.** A new
per-room house rule sits beside the shot clock: seconds configurable, default
30, and `enabled` fixed true. The clock is load-bearing, not a preference — with
ordering enforced, one locked phone blocks every player behind it, and eviction
does not reach a complete hand. A house rule whose "off" position can wedge the
room is a bug with a toggle. It reuses the action clock's scheduler, its
`turnEndsAt` broadcast, and the shot-clock component. Expiry is the server
issuing an ordinary command, which lands in the recording and re-runs under
Replay as an ordinary act: it mucks the head of the queue, unless they are
compelled, in which case it shows them. That is the one place cards are turned
over on a player's behalf, and it is the place a pot would otherwise be settled
with nothing tabled.

## Consequences

- `ShowdownCompleteHandState` gains `queue` and `mucked`; the views carry both,
  so "not shown yet" and "declined" are distinct states the table can tell
  apart. `HandEvent` gains `HoleCardsMucked`, `RejectionReason` gains
  `showdown-unresolved`, and `ENGINE_LOG_VERSION` moves to 6. Fixtures are
  regenerated.
- A bot in the queue would wedge the room, so it resolves on its turn after the
  usual bot action delay — not instantly, which would make the queue jump in a
  way the room cannot follow — showing if compelled, otherwise rolling show or
  muck weighted heavily toward showing.
- The player's device carries a persistent turn prompt, *"Show your hand, or drag
  up to muck"*, or *"Show your hand"* with no muck line when compelled: offering
  an option that will be rejected is worse than not offering it. This is not the
  `coaching.ts` one-shot teaching system; an experienced player still needs to
  be told whose turn it is.
- The table reuses the betting turn's active-seat treatment for the head of the
  queue rather than inventing a showdown-only highlight. The clock shows as a
  ring on the player's own cards, where the person about to lose their hand is
  looking, and only in its closing seconds on the table's active seat plate, so
  the room gets the "clock's running" beat without a permanent timer on screen.
- A muck reuses the existing fly-to-muck animation and the existing fold sound;
  a show reuses the card-flip sound. No new cues — showdown is tense because the
  room is silent and waiting.
- A muck is its own Replay beat, captioned "Seat N mucks". An auto-muck from
  clock expiry is captioned identically: the recording says what occurred at the
  table, not why, and "timed out" is a fact about the room rather than about the
  hand.
- If an untimed showdown is ever wanted, it arrives together with an extension
  of eviction into the showdown window as the manual out — not as an "off"
  position on this house rule.

## Amendments

### An all-in hand tables at the run-out, not at the window

"Tabled by the engine at that instant" put every all-in hand face-up when the
showing window opened — after the whole board was already out. At a real table
the order is the other way round: the hands go face-up when the betting ends,
and the room watches the remaining streets against cards it can already see.
That is the entire drama of an all-in, and the window's opening is far too late
for it.

So the tabling moves to where the betting actually ended. When fewer than two
seats can still act and a run-out follows, the engine emits `HoleCardsTabled`
for every live seat *before* it deals the remaining streets; `BettingHandState`
gains `tabled` and the betting views carry those hands, so a tabled hand is
public from that event on.

Every live seat, not only the all-in ones. The seat that covers a shove and is
merely out of opponents is in exactly the same position — it cannot bet again,
and its cards decide the pot — and the rule at a real table is that all hands
go up once someone is all-in and the betting is complete. Leaving it concealed
also asks the room to sit through a showing window for a decision that no
longer exists.

That is this amendment's one departure from the Decision above: a tabled seat
is not asked to show or muck. `finishAtShowdown` publishes a `RevealedResult`
for every tabled contestant as the window opens, which empties the queue, so a
run-out declares its winners as the river resolves rather than resting on a
clock. Where the betting ends without a run-out nothing changes — the window
opens at river close, the queue holds every contestant, and the compulsion
rules are as decided.

The log gains an event type without changing the meaning of any existing one,
so `ENGINE_LOG_VERSION` stays where it is and older recordings replay
unchanged.
