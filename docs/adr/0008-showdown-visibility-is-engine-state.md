# 0008 — Showing at showdown is optional, and lives in engine state

## Status

Accepted. Depends on [ADR-0007](0007-all-in-as-declared-actions-without-chip-values.md)
for the all-in actions this decision compels to show.

## Context

Reaching showdown revealed every surviving Seat's Hole cards unconditionally:
`ShowdownCompleteHandState.results` is a list of `RevealedResult`, and `view()`
hands the same list to the table and to every player. That is not how Texas
Hold'em is played. Showing is compulsory only for the last aggressor, and a
losing hand may muck rather than expose how it was played.

Two constraints shaped the answer. `CONTEXT.md` makes the table surface obey
live visibility "exactly by re-projecting `view(state, 'table')`", so any
concealment implemented as a client-side filter would be re-revealed by Replay —
a mucked hand has to stay mucked. And the presentation was a full-screen
`ShowdownOverlay`, a second table that hid the one people were already looking
at.

## Decision

**Showing is engine state.** Two new commands — `reveal`, table-originated in the
pattern of `startHand`/`nextHand`, and `show`, sent by a player — produce events
that Replay re-runs. Hole cards a Seat has not shown do not leave `view()`, and
neither does anything derived from them: no `rank`, no `bestHand`, no
`description`. `RevealedResult` becomes the type that exists *only* for a shown
Seat, so holding one is proof the cards are public. The showdown view carries
`contestants` — every Seat that reached showdown, shown or not — separately from
`results`, so the table can render a concealed Seat without learning its hand.

**The hand rests before it resolves.** River close leaves the hand awaiting
reveal: no Hole cards and no `winners` in any view. The table's Reveal press
turns over the compulsory hands and publishes `winners`. Compulsory means the
river's last aggressor (`lastAggressor`, reset each street, so a checked-through
river has none) plus every all-in Seat; if that set is empty, the winning Seat is
compelled instead, because a pot must never be awarded to two face-down cards.
Every other contestant may then show, in any order, and a Seat that has shown
cannot conceal again. The window closes when the table deals the next hand,
which mucks whatever was not shown.

**Showdown happens on the table, not over it.** Shown cards appear on the Seat
plate, oriented toward the table centre, with the verdict and a rank badge —
hands are ranked best-first with ties sharing a badge, listing shown hands only,
because with side pots (ADR-0007) "who won" has more than one answer and the
humans settle the chips. Card backs sit above an unshown Seat while the window is
open and vanish when the hand closes. `ShowdownOverlay` survives as a house rule,
defaulting off and persisted per-room. A player's own device shows only their own
hand and the verdict: the table is the shared surface.

## Consequences

- Showing is a distinct concept from *Hole-card reveal*, which stays local
  presentation and keeps its gesture. The player's show control is a separate,
  explicit button, because irreversible publication should not ride on the
  gesture used all hand for a private, freely reversible peek. `CONTEXT.md` gains
  *Showdown show* and amends *Hole-card reveal*, whose current text states that
  reveal never affects Showdown.
- `RejectionReason` gains `not-at-showdown`. Repeat presses of `reveal` and
  `show` are idempotent no-ops — a shared table screen will be double-pressed,
  and that is not an error.
- `deriveSeat` in the table client currently infers hand participation from
  presence in `results`; it must read `contestants` instead, or a concealing Seat
  renders as though it never played.
- Existing Hand recordings contain no `reveal`/`show` commands and replay as
  showdowns where nobody showed. Fixtures are regenerated. No legacy
  reveal-everything branch is added: the visibility path stays single, which is
  the property that made this decision implementable at all.
- Six or more shown hands cluster at the table centre and may force smaller cards
  than the overlay used. This is a layout risk to test at 6–8 seats, not a reason
  to keep the overlay as the primary surface.
