# Engine

The pure poker rules engine (`packages/engine`). Event-sourced and side-effect
free: `decide(state, command)` returns events or a `Rejection`, `apply(state,
event)` folds one event into the next state, and `view(state, seat)` derives a
restricted snapshot. See `CONTEXT.md` for vocabulary and `docs/adr/0001` for the
value-less-pot decision.

## No tracked pot, positional blinds

The engine **never stores a chip amount** — no pot, no stack, no bet size
(CONTEXT.md; Phase 1 spec #130 §1). Blinds are tracked *positionally*, exactly
like the button. This is the single most load-bearing invariant, and several
rules exist only to keep legality mirroring the physical chips without a value:

- `facingBet` (`table.ts`): a seat faces a bet once someone has raised
  (`raiseOccurred`); **preflop, before any raise, every seat except the big
  blind also faces a bet** — the big blind's own post already matches it, which
  is why the big blind alone may check an unraised preflop, and why that turn is
  also their "option" (it's the last of the preflop lap).
- `legalActions` is the **single source of truth** for action legality, consumed
  by both `decide` (enforcement) and `view` (the client's `legalActions` field)
  so the two can never drift. Fold, raise and both all-ins are always legal;
  check and call are mutually exclusive and follow `facingBet`. Clients read the
  same `facingBet` predicate to decide whether to offer the all-in pair or a
  single "All in" (ADR-0007).

## Positions and action order

- The **ring** is the fixed positional order for the whole hand: button+1, …,
  button (button last). Folds never change it; `toAct` is the live sub-sequence
  owed a decision this street, `toAct[0]` being the current actor.
- `isHeadsUp` is decided off the **ring** (the seats dealt), not the live seats.
  Every position rule that reads differently heads-up — both blind seats and the
  preflop order — asks this one question, so a short-handed lap can never read as
  heads-up and disagree with the blind positions it was dealt with.
- `smallBlindSeat`/`bigBlindSeat` use ring order, never seat-number arithmetic
  (seats need not be contiguous). Heads-up the button posts the small blind, so
  `smallBlind === button`; `bigBlind` is the non-button seat.
- `initialToAct` (`table.ts`): postflop runs the ring as-is (SB→button). Preflop
  with 3+ seats opens "with the first player to the left of the blinds" (Robert's
  Rules) — the ring rotated past the two blinds (`ring[2]`). Heads-up opens on
  the button/SB. The big blind is last in every case, so their option needs no
  special machinery: every street closes the same way, when `toAct` drains.
- `requeueAfterRaise`: after a raise, every *other* live seat gets one more turn
  in position order starting after the raiser; the raiser isn't re-added, so the
  street closes when the queue drains. All-in seats are skipped, which is also
  what keeps an `allInRaise` from requeueing itself.

## All-in and the run-out

`allInCall` and `allInRaise` mark the seat `allIn` and retire it from the
betting; they differ only in whether they reopen it (ADR-0007). Three predicates
in `table.ts` carry the distinction:

- `canStillAct`/`actingSeats`: unfolded *and* not all-in — who a street may open on,
  and who `requeueAfterRaise` may requeue.
- `liveSeats`: unfolded, all-in included — who the fold-out check counts and who
  is ranked at showdown. A shover therefore cannot be folded out.
- `reopensBetting`/`isAllIn`: the two facts `apply` needs from an action.

`canOpenABettingRound` (fewer than two acting seats) drives both halves of the
run-out. A street that closes without it deals the remaining `BoardDealt`
events with no `StreetStarted`, through the river and on to `ShowdownReached`.
A street *already* open ends the moment nobody left in `toAct` faces a bet
(`stillOwesADecision`), so the last deep seat is never asked to check against
opponents who cannot answer — while a lone seat that *does* face a shove still
gets its fold-or-call.

`CardBurned` advances `hand.street` before the burn is fanned out, so the
table never renders a new burn against the prior street (including during an
all-in run-out). `BoardDealt` then appends that street's board cards, and
`StreetStarted` only confirms the street the burn and board already moved to.

## `apply` details

- `ActionTaken` removes the acting seat from `toAct` **by identity**, not by
  popping the head: ordinary actions belong to `toAct[0]`, but an eviction can
  fold a live seat later in the queue while leaving the current actor at the
  head.
- `handPositions` snapshots `smallBlind`/`bigBlind`/`dealtSeatCount`/`burnedCount` at hand
  completion, while `ring` is still in scope, so a completed hand (which drops
  `ring`) reports the same positions `view` derives during betting — and so the
  button's rotation on `HandComplete` can't reach back and change what the
  finished hand says about itself. `dealtSeatCount` is fixed for the hand (folds
  don't reduce it), so `2` identifies a heads-up hand in every phase.
- `HandComplete` rotates the *engine* button (`nextButtonAfter`) but keeps the
  completed hand's own recorded button, so the finished hand and the forecast
  for the next one are independent.

## Determinism

Hole cards, burns and board cards are all sliced from one seed-derived deck
(`shuffledDeck(seed)`) by position, through the single reader `dealFromDeck`.
The only deck state a hand keeps is `cardsDealt`, the count of positions it has
consumed: `apply` advances it on `HoleCardsDealt`, `CardBurned` and
`BoardDealt`, so it is derived from the event log like everything else, and the
undealt deck order is still never reachable from engine state. Burns consume
real positions, so the board a seed produces depends on how many cards have
burnt (`CONTEXT.md`, Burn).

## Types and visibility

- `SeatId` is a stable table position (0–7), never re-derived from an index into
  a filtered/live array. A `Card`'s identity is its rank+suit, never its
  position.
- `RevealedResult` (a `ShowdownResult` with hole cards attached) is the **only**
  place another seat's hole cards are structurally reachable, and only ever for
  a seat that reached showdown live (Phase 1 spec #130 §4). Built once in
  `apply` from the betting players map.

## `view` derivation

- Player and table views derive from the same authoritative state so the table
  device is never privileged over a player (§4). The `"table"` sentinel selects
  the table overload.
- **Between hands there are no blind fields** (`NoHandView`): the engine button
  has already rotated on, so `button` is a forecast, and the blinds are likelier
  than the button to move again before the deal (seats can be claimed, vacated,
  or set to sit out).
- A seat's `yourHoleCards` is null once folded; `legalActions` is populated only
  when it is that seat's turn (`toAct[0] === seatId`).

## Replay

A Hand's Command log opens with the operation that started it, which for every
Hand after the first is a `nextHand`. `decide` only accepts that against a
completed Hand, and Replay is scoped to one Hand starting from no Hand at all —
so the opening Command is run as the `startHand` it behaved as. Both take the
same path through `beginHand`, on the same seed and recorded Button, so the
generated Events match the ones the live run recorded.

Because `decide` echoes back whatever Command it was handed, a generated
Rejection has the substituted Command on it. Replay restores the Command as
*recorded* before comparing, or the substitution would leak into the audit
comparison and report a faithful recording as corrupt.
