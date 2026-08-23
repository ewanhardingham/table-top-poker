# 0010 — Burns are engine truth, and burnt cards never leave the server

## Status

Accepted. Recorded with the burn work in #263 (#264 engine, #265 pile and cue,
#266 animation and docs).

## Context

A burn is the card a dealer discards immediately before each of the flop, turn
and river. At a real table it is the anti-cheat ritual that this app's felt was
missing: three cards a hand, none preflop, and only for a street the hand
actually reaches.

Nothing in the rules of the game turns on it. The winner is the same either way,
which is exactly why it was tempting to treat the burn as decoration — a card
that flies onto the felt and catches fire, with the engine never told. Two other
questions came with it: whether a table that shows the burn should be told which
card burnt, and what to do with recordings made before the engine knew about
burns at all.

## Decision

**Burns are engine truth, not table dressing.** `CardBurned` is a real event and
a burn consumes a real deck position, advancing the hand's `cardsDealt` cursor
like any other deal. A burn that existed only in CSS would be unobservable
under a seeded shuffle: the same seed would produce the same board whether the
flame played or not, and the first person to read a hand log against the deck
maths would find the animation lying about what the deck did. Board cards now
depend on how many cards have burnt, which is the property that makes the burn
real rather than performed.

**Burnt card identities never leave the server.** `redactEventFor` nulls
`CardBurned.card` for every recipient alike — table and seats — so the wire
carries only that a burn happened, and the table view carries only
`burnedCount`. A burnt card is a card removed from the deck: publishing it hands
anyone reasoning about outs a free card of information that nobody at a real
table has. The recorded event on disk keeps the card, so a server-side replay
can still audit what the deck did.

**v6 recordings are orphaned by the log bump, not kept alive.** `CardBurned`
moved `ENGINE_LOG_VERSION` to 7, and a v6 recording no longer replays. Keeping
them would mean a permanently forked deck-offset function — one that skips
burns for old logs and honours them for new — living in the engine's
determinism path forever, so that every future reader of the deck maths has to
hold two versions of it in their head. The recordings are a development-time
convenience with no production users; the fork would be permanent.

## Consequences

- The board a given seed produces changed. Engine fixtures were regenerated, and
  any hand-checked deck arithmetic predating #264 is wrong.
- The table can never display a burnt card, so the burn animation is a
  face-down card throughout, and the replay caption is "A card burns" with no
  identity in it.
- `CardBurned` is a first-class Replay beat: it carries its own weight in
  `beats.ts` and opens its street's chapter, so seeking to "Flop" plays the
  burn that precedes the flop rather than starting after it.
- Recordings made before the bump are unplayable and were not migrated. If
  replaying old logs ever matters, it is a migration tool over the recording
  files, not a branch in `dealFromDeck`.
