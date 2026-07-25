# 0001 — Preflop action legality mirrors blind posts, without tracking a chip value

## Status

Accepted

## Context

The wayfinder map (issue #1) closed Small Blind / Big Blind as "purely
positional Seat labels, no values posted" — Phase 1 tracks no chip amount,
no Pot, no stakes (`CONTEXT.md`, `docs/phase-1-spec.md` §1–§2). Issue #20's
first implementation took that literally: `check` was legal for every seat
on an unraised preflop, including the Small Blind and everyone after it.

That's wrong for how this table is actually played: players sit around a
physical table with real chips, and post real small/big blinds before the
program ever sees a `startHand` command. A Small Blind who "checks" for
free preflop in the engine, while the person across the table has
physically already put a bigger blind in the middle, is a state the engine
can reach that the physical table can't. The engine's legality has to
respect that a bet already exists at the table, even though it never
counts it.

## Decision

Preflop, before any real `raise` command, every seat *except* the Big
Blind faces a bet: `check` is illegal for them (must `fold`/`call`/`raise`),
mirroring that they haven't yet matched the difference between their own
post (nothing on this decision, or the Small Blind) and the Big Blind's.
The Big Blind alone may `check` — on their ordinary first turn, and again
on the later "option" revisit if the street was limped around — because
their own post already matches the current bet. Once a real `raise` fires,
the ordinary bet/raise/call machinery takes over for every seat, and this
special case no longer applies for the rest of the street.

No chip amount, Pot, or stack is introduced anywhere in engine state —
this is purely an addition to the `check`/`call` legality check
(`facingBet` in `packages/engine/src/table.ts`), not a value-tracking
feature. Postflop is unaffected: nobody has a standing post there, so
`check` stays legal for everyone until the first real raise, as before.

## Consequences

- `decide`'s legality check now needs to know the acting seat and the
  hand's `ring`/`button`, not just a single `raiseOccurred` boolean —
  `isLegal` and `facingBet` take the seat as a parameter.
- The Big Blind seat identity (`bigBlindSeat`) is now needed both for
  street closure (the existing "BB option" flag) and for legality, and had
  to be generalized to heads-up, where the non-Button seat is the Big
  Blind rather than `ring[1]`.
- `CONTEXT.md` and `docs/phase-1-spec.md`'s "no values posted" wording is
  updated to distinguish "no chip *amount* tracked" from "preflop legality
  ignores that a bet exists" — the former stands, the latter doesn't.
- Phase 4's chip/stake/Pot tracking (conditional, per the roadmap) remains
  untouched and out of scope; this ADR does not introduce any of it.
