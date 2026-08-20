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
  so the two can never drift. Fold and raise are always legal; check and call
  are mutually exclusive and follow `facingBet`.

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
  street closes when the queue drains.

## `apply` details

- `ActionTaken` removes the acting seat from `toAct` **by identity**, not by
  popping the head: ordinary actions belong to `toAct[0]`, but an eviction can
  fold a live seat later in the queue while leaving the current actor at the
  head.
- `resolvedBlinds` snapshots `smallBlind`/`bigBlind`/`dealtSeatCount` at hand
  completion, while `ring` is still in scope, so a completed hand (which drops
  `ring`) reports the same positions `view` derives during betting — and so the
  button's rotation on `HandComplete` can't reach back and change what the
  finished hand says about itself. `dealtSeatCount` is fixed for the hand (folds
  don't reduce it), so `2` identifies a heads-up hand in every phase.
- `HandComplete` rotates the *engine* button (`nextButtonAfter`) but keeps the
  completed hand's own recorded button, so the finished hand and the forecast
  for the next one are independent.

## Determinism

Hole cards and board cards are all sliced from one seed-derived deck
(`shuffledDeck(seed)`) by fixed position — no deck state is ever stored, so the
remaining deck order is never reachable from engine state. `dealCommunityCards`
starts at `numSeats * 2 + boardLenSoFar`.

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
