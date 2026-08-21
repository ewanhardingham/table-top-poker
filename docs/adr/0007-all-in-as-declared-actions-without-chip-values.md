# 0007 — All-in is two declared actions, without tracking a chip value

## Status

Accepted. Extends [ADR-0001](0001-preflop-legality-without-tracked-blind-values.md)
without reopening it: no chip amount, Pot, or stack is introduced.

## Context

The engine never stores a chip amount (`docs/design/engine.md`, ADR-0001), and
until now `ActionType` was `fold | check | call | raise`. That set has no way to
say "this seat has no chips left", which makes an all-in unrepresentable: the
seat stays in `toAct` and is asked to decide again on the next street, where
`check` is illegal facing a bet and every other action is a lie.

Showdown visibility (ADR-0008) needs the same fact for a different reason — a
seat that cannot fold cannot be allowed to conceal — so the gap had to close
before optional showing could be built.

The hard part is that "all-in" is two different poker events wearing one name. A
short stack putting their last chips in to match a bet does not reopen the
betting; a deeper stack shoving over a bet does. A value-less engine cannot tell
these apart, because the distinction is entirely about an amount it refuses to
know.

Three ways out were considered. Inferring aggression from `facingBet` alone gets
the re-raise-all-in case wrong. A single `allIn` action that always reopens
betting hands out turns to seats that have already acted. Marking a seat all-in
from the table device puts a poker decision on the wrong screen.

## Decision

`ActionType` gains **two** actions, `allInCall` and `allInRaise`. Both remove the
acting seat from `toAct` for the remainder of the hand; they differ only in
whether they reopen the betting:

| Action | Reopens betting (`requeueAfterRaise`) | Can act again |
| --- | --- | --- |
| `allInRaise` | yes | no |
| `allInCall` | no | no |
| `call` | n/a | yes |

The distinction is declared by the human, who is the only party that knows their
own stack. Both are offered whenever the seat faces a bet; when it does not,
`allInRaise` is the only all-in available and the client labels it "All in".
A player who covers a shove and wants to continue simply presses `call` — the
engine needs no notion that they covered it, because "can this seat act again"
is the only fact that matters.

`allInRaise` sets `lastAggressor` (ADR-0008); `allInCall` does not.

Consequent rule changes:

- **Fold-out counts all-in seats as unfolded.** A shover cannot be folded out of
  a pot they have already bought a claim to, so `HandFoldedOut` fires only when
  exactly one seat is unfolded counting all-in seats.
- **The run-out is automatic.** When fewer than two seats can still act,
  remaining streets deal without opening — `BoardDealt` with no `StreetStarted`,
  through to the river. There is no betting turn with nothing to bet against.
- **Both all-in actions are confirmed before they send.** They are irreversible
  and self-excluding, and a misdeclared `allInCall` locks a covered player out of
  their own hand.

## Consequences

- Side pots remain a physical-chips problem. The engine can rank hands but
  cannot say who wins which pot, which is why showdown leads with a rank order
  rather than a single winner (ADR-0008).
- `legalActions` stays the single source of truth: it gains the two actions and
  the `facingBet` predicate that already separates `check` from `call` now also
  decides which all-in labels a client shows. (Refined in #253 — `legalActions`
  now reads the Seats as well as the street: an all-in call needs a bet to
  match, and either raise needs a Seat left able to answer it.)
- The client paces the automatic run-out itself; `boardDeal.ts` already stages
  the board, so three streets emitted at once still read as three beats.
- A misdeclaration is not recoverable. There is no undo, and adding one would be
  a general facility touching replay, not part of this decision.
- Phase 4 chip/stake/Pot tracking remains out of scope and untouched.
