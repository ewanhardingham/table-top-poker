# 0006 — The player menu is always reachable; the top bar degrades around it

## Status

Accepted. Builds on
[ADR-0005](0005-players-can-release-their-own-seat.md): that decision moved
the seat actions *into* the menu; this one is about the menu still being
there to open.

## Context

ADR-0005 put sit out and leave behind the burger, which made the burger the
only route to either. The player top bar was a flex row that could not
shrink: the seat pill carried `flex: none`, so when its pills over-ran the
width the connection badge and burger were pushed past the container edge.
`.app-shell` sets `overflow: hidden`, so nothing scrolled the burger back
into view — it was clipped away entirely.

Observed on both Android and iOS with a seat pill, a sitting-out pill, a
connection pill and the burger on one row. The player could neither sit out
nor leave; the escape hatch ADR-0005 deliberately made available while
disconnected was itself unreachable, and the worst case is a flaky
connection — exactly when the sitting-out pill is showing and the player
most wants out.

Display names are already capped at 10 characters
(`MAX_DISPLAY_NAME_LENGTH`), so the driver is the *number* of pills, not the
length of any one of them. A wider phone does not fix it; it only needs one
more pill.

## Decision

**The menu button's space is reserved by the container, and everything else
in the top bar gives way to it.**

The header is a grid of `minmax(0, 1fr) auto`. The second track is the
burger's and cannot be consumed; the first is where all content lives and
may shrink below its natural width. This is deliberately a property of the
container rather than of its children: a flex row can be made to behave
identically today, but only for as long as every future sibling is added
with the right `flex` value. A fixed track cannot be taken back by a pill
someone adds later.

Every pill — including the connection badge — lives in the flexible column.
Nothing shares the reserved track with the burger, because anything that does
competes with it for exactly the space this decision is protecting.

Within the flexible column, precedence runs: **menu > seat number > sitting
out > player name > connection.** Concretely:

- The seat pill truncates its *name* only; `· Seat N` is fixed and always
  legible. The seat number is how a player identifies themselves against the
  table screen, whereas their own name is the one thing on the bar they
  already know.
- The connection badge reports trouble, not health. It is hidden while
  connected, and shown only once a connection has been made and lost —
  `connectionStatus` starts at `disconnected` before any socket opens, so
  showing that state verbatim would warn about a drop that has not happened,
  on every load. The `hasEverConnected` latch in `connectionSlice` is what
  separates the two, and clears with the connection.
- When the badge *is* showing, it is the first thing to give way: it carries
  `flex-shrink: 100` against the seat pill's 1, so its label collapses to the
  bare status dot — which still reports the state in colour — long before the
  player's name starts truncating. Precedence is expressed as a shrink weight
  rather than a width breakpoint on purpose: a breakpoint would have to guess
  how many pills are on the row, and would drop the label at widths where it
  fits perfectly well.
- No pill carries `min-width: 0` itself, only the text *inside* it. A pill
  with `min-width: 0` shrinks past its own unshrinkable content and paints it
  outside its border, over the pill beside it — the failure this replaced.
- Top-bar pills are tracked at `0.1em` rather than `0.16em`, trimmed on the
  shared style so the row still reads as one set.

The last three rules are not about the burger and so are not the player's
alone: any status bar with more content than width picks something to
sacrifice, and picking by shrink weight beats picking by accident. The
table's bar follows them too — its badge collapses to the dot, and its room
pill drops the `ROOM` kicker before the code.

Because jsdom has no layout engine, the automated guard is on this structure
— the reserved track, the shrinkable column, the truncation target — and not
on measured widths, which would pass on a bar that still overflows. The
structure is necessary but not sufficient: both the collapsing seat pill and
the badge's misplacement in the reserved track passed the structural tests
and were caught only by measuring the real thing in a browser. Layout changes
to this bar want a real render at 320px with every pill forced on.

## Consequences

- Adding a pill to the player top bar can no longer hide the menu. It can
  crowd or truncate the pills beside it, which is the intended failure.
- A steady, connected player sees one fewer pill; a badge appearing now
  means something is actually wrong.
- `Waiting for next hand` is shortened to `Waiting` — in a pill next to a
  seat number, waiting can only mean the next hand.
- Anything added to the reserved track in future shares a fixed column with
  the burger and so competes with it directly. Prefer the flexible column.
- `table-client`'s status bar carried the same unshrinkable-flex pattern and
  now follows the same rule: its connection badge yields its label to the
  bare dot, and the room pill gives up its `ROOM` kicker before the code.
  There is no menu to strand there, so the stake is only a badge pushed off
  the edge below ~293px — but the discipline is the same one, and applying it
  in both places is what stops the pattern being reintroduced by copying the
  other client. Below ~215px the room pill and the badge cannot both fit at
  their minimums and will overlap; no table display is that narrow, and
  making the room code itself truncate would cost the one thing on that
  screen a player has to be able to read.
