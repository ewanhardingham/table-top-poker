# Design notes

Rationale that used to live in code comments. The code documents *what* it does
through names and types; these notes hold the *why* — the non-obvious decisions,
invariants, and trade-offs — so the source can stay comment-light (see the
"Code comments" standard in `CLAUDE.md`).

These are a companion to, not a replacement for, the canonical specs and
decisions:

- **ADRs** (`docs/adr/`) — accepted decisions with lasting consequences.
- **`CONTEXT.md`** — the domain model and vocabulary.
- **GitHub issues** — the PRDs/specs each feature was built to (referenced as
  `#NNN`, and section references like `§7` point into those specs).

A design note captures reasoning that has no better home among those. When a
decision graduates to an ADR, trim the note to a pointer.

## Notes

- [`holecards.md`](holecards.md) — the player's hole-card gesture surface
  (spec #138): the pure lifecycle, the pointer recognizer, coaching hints, and
  the React binding.
- [`engine.md`](engine.md) — the pure rules engine: value-less pot, positional
  blinds, action order, determinism, and view derivation.
- [`protocol.md`](protocol.md) — wire types and schemas: the single
  trust-boundary schema pattern, room-wide settings, seat-state predicates.
- [`server.md`](server.md) — transport layer: view secrecy/redaction, the
  connection-independent action clock, seat lifecycle, caching, and bots.
- [`burn-pile.md`](burn-pile.md) — the burn pile's layout and the 700ms the
  flame has: the budget the board deal waits out, why it peaks late against the
  cue, and the tuning of the chosen animation.
- [`replay-layout.md`](replay-layout.md) — the felt's two scales and the
  replay's bands: why the table sizes off the felt rather than the root, how
  the even-gap band was fitted, and the measurements it was fitted to.
- [`clients.md`](clients.md) — player/table client and `ui-shared` notes: the
  audio engine, viewport locking, reconnect, and rendering rationale.
