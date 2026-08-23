# The burn pile: layout and the 700ms the flame has

The table shows every burn: a face-down card flies in from the deck, catches
fire on the felt, and settles onto a small stack to the left of the board. The
pile is what the room reads as "three cards burnt this hand" without counting
anything. Why the burn is engine state at all, and why the card's identity is
never on the wire, are [ADR-0010](../adr/0010-burns-are-engine-truth-and-never-leave-the-server.md).

## Layout

`BurnPile` renders `view.burnedCount` face-down cards, absolutely positioned in
one box to the left of the community cards (`right: 100%` of the board's row,
so it never pushes the board off centre as the pile grows). `pileCards` scatters
them deterministically — each card offset by its index, rotation from
`(index * 7) % 13 - 6` — so the stack reads as cards dropped by hand rather
than a deck, and re-renders identically. The pile is `aria-hidden`: it is a
count already carried by the state, drawn as cards.

Only cards past `piledBefore` are `arriving`. A pile that mounts whole — a
reconnect mid-hand, a replay seek landing after two burns — appears settled,
with no cards flying in for burns that happened while nobody was looking.

## The budget, and why the flame peaks late

`BURN_BUDGET_S` is 700ms and the whole burn lives inside it. `streetDealDelay`
holds the board's own deal-in for exactly that long, so the flop lands after the
flame rather than through it — the two animations never overlap.

The cue (`assets/sounds/burn.wav`, #265) is a **swell, not a hit**: the source
had no attack transient, so the file is a ~500ms build to a peak with nothing to
sync a first frame against. The animation was designed around that shape rather
than the other way round. `burnTiming` therefore splits the budget:

| Phase | Window | What it is |
|---|---|---|
| `travel` | 0–260ms | The card flies from the deck and lands on the pile. |
| `ignite` | 130–500ms | The flame catches while the card is still moving, and builds. |
| `fade` | 500–700ms | It dies back. |

`peakAt` is 500ms — the flame is brightest with the cue's swell, not ahead of
it. The catch at 130ms is deliberately *before* the card lands: a flame that
waited for the card to settle read as a second, separate event.

Under reduced motion every phase collapses to zero. The card is simply on the
pile, the board deals immediately, and no flame renders at all.

## The animation: variant E, flare and curl

Five variants were built in a throwaway Vite entry against the real `Card` and
the real cue, and picked by a human in the browser (#265). The harness was
deleted with #266; the losing variants are in that branch's history.

The winner is a blend of two of them: a radial **bloom** from beneath the card
(B), with **tongues** climbing its edge and the card **curling** on top (C). The
blend is not a straight union — at full strength the two fight, so five values
are pulled back in `FLAME`:

| Knob | Alone | In the blend | Why |
|---|---|---|---|
| Bloom size | 5em | 4.2em | The tongues add their own light; the full bloom swamped them. |
| Bloom peak opacity | 1.0 | 0.85 | Same. |
| Card brightness pulse | 2.4× | 1.9× | Two light sources at full strength blew the card face out. |
| Tongue height | 2.6em | 2.2em | So the tongues read *against* the bloom rather than dissolving into it. |
| Card curl | -22° | -18° | The bloom already lifts the card; the full curl tipped it too far. |

These were arrived at visually, against the real cue on the real felt. Treat
them as a tuned starting point, not as derived constants.

The bloom is a sibling of the flying card, not a child of it, and sits at the
card's resting place from the start. Inside the travelling wrapper it would fly
in from the deck and be faded up by the card's own entry — a fire that arrives
with the card rather than one the card lands in. The card's brightness pulse
and the bloom share `flameKeyframes`, so both are brightest at 500ms; without
those keyframe stops the card's three-frame pulse would peak at the midpoint of
its span, ~85ms ahead of the cue.

The three tongues stagger 40ms apart but all end together on the budget
(`tongueFlames` shortens each one's duration by its own delay), so the fire goes
out at once instead of trailing a last tongue past the flame. The card's
brightness pulse returns to `brightness(1)` rather than settling scorched: the
burnt card joins a pile of cards drawn with no filter at all, and a permanently
dimmed top card would read as a rendering fault rather than as ash.

Only the arriving card burns. Everything already on the pile is a plain
face-down `Card`.
