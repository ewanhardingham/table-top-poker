# The burn pile: the 700ms the fire has, and the ash it leaves

The table shows every burn: a face-down card flies in from the deck, an ember
front eats it away on the felt, and what is left is ash. The ash is what the
room reads as "three cards burnt this hand" without counting anything. Why the
burn is engine state at all, and why the card's identity is never on the wire,
are [ADR-0010](../adr/0010-burns-are-engine-truth-and-never-leave-the-server.md).

Nothing survives the burn. That is the point: a stack of face-down cards is a
tally, and a tally invites counting; a smear of ash is a trace, and a real table
carries traces. The card is destroyed on screen, so the pile can never be
mistaken for cards still in play.

## Layout

`BurnPile` renders one stage to the left of the community cards, `right: 100%`
of the board's row so it never pushes the board off centre. The stage is far
wider and taller than the card — embers leave it upwards and ash falls below
it — so `Board` pulls it back by `ASH_PILE_RIGHT_EM`, which is the gap it wants
minus the stage's own overhang. The gap lands against the *card*, not against
the box drawn around it.

That gap is `BOARD_GAP_EM`, and it is wider than the 1.2em the old pile used.
1.2em was sized for a neat stack of cards; ash is a loose scatter and needs felt
around it, or it reads as part of the street rather than as something left
beside it.

Everything in the stage is measured in the pile's own em, which `BOARD_CARD_EM`
sets, so the burnt card matches the community cards beside it and the whole
burn scales with the table rather than with the screen.

The pile is `aria-hidden`: it is a count already carried by the state, drawn as
fire.

## The budget, and why the fire peaks late

`BURN_BUDGET_S` is 700ms because the cue (`assets/sounds/burn.wav`) is 700ms
long. The budget is not a design choice made against the animation and then
matched to the sound — it *is* the sound's length, and the card finishes being
eaten as the cue dies.

The cue is a **swell, not a hit**: the source had no attack transient, so the
file is a build to a peak at 500ms with nothing to sync a first frame against.
`CUE_PEAK_S` is that 500ms, and it is an absolute property of the audio file
rather than a fraction of anything. Any future change to the budget has to
re-reason the peak, not scale it.

| Phase | Window | What it is |
|---|---|---|
| `travel` | 0–260ms | The card flies from the deck and lands. |
| `ignite` | 130–500ms | The front catches and builds to the cue's peak. |
| `consume` | 180–700ms | The front eats the card, finishing on the budget. |
| `settle` | 180–1400ms | Ash falls, running on past the budget. |

The catch at 130ms is deliberately *before* the card lands: a flame that waited
for the card to settle read as a second, separate event. The consume opens at
180ms, just after the catch, so the card is seen catching before material starts
leaving it.

`cueHeat` shapes the ember glow's rise and fall separately so it is brightest
exactly on 500ms. A single symmetric curve over the budget would peak at 350ms —
ahead of the swell — which is the mistake the shipped flare quietly made before
this.

**The ash is outside the budget on purpose.** `streetDealDelay` gates the board
on `BURN_BUDGET_S`, which is when the *card* is gone, not when the last flake
lands 700ms later. Falling ash is silent and low-contrast in the corner of the
felt, so it costs nothing to let the flop deal through it — and gating the
street on a settled pile would cost the table another 700ms a street for a
detail nobody is looking at. The flop lands after the fire, not after the ash.

## The burn front

The front is a scalar field, not a sweep: `dissolveField` gives every texel of
the card the moment it is eaten, 0 first to 1 last, normalised so a threshold
running 0 to 1 eats exactly the whole card and no more. Fire climbs, so the
field opens at the bottom edge and leans across as it goes, roughened by four
octaves of value noise — a straight edge travelling across the card reads as a
wipe rather than as burning.

One field drives both sides of the effect. The shader discards texels the
threshold has passed and lights the ones just behind it as the ember rim; the
particles read the same field to decide when each flake is born. That is why a
flake leaves the card exactly where and when the front passes it: the two are
not two animations timed to agree, they are one field read twice.

## The ash

Every dissolved texel leaves as an ember that cools to ash, simulated on the
CPU: buoyancy decaying into gravity, drag, and a lateral sway phased on each
flake's **own age**. Sharing a clock for that sway is the obvious way to write
it and it is wrong — every flake is pushed the same way at the same moment and
the whole cloud drifts off as one body, which reads as wind rather than as ash.

Where a flake lands is squashed back into the card's own footprint by
`ashFootprint`, using `tanh` rather than a clamp. Left alone, the drift spreads
ash wider than the card it came from and runs it under the first community card;
clamped, the outliers bunch against the limit and the pile reads as a slab with
cut ends. The softness factor keeps the squash off its own asymptote, so the
edges stay ragged.

The heap underneath accumulates per landing against a cap (`HEAP_RISE_EM`,
`HEAP_MAX_EM`). The rise is deliberately small relative to the cap: a larger
step drives every column to the ceiling within one hand and the pile flattens
into a bar instead of mounding where the ash actually falls.

Under the ash sits a scorch stain that deepens with each burn, sized to the same
footprint and capped in growth — unbounded, it reached under the board by the
third burn.

These values were arrived at visually, against the real cue on the real felt, by
a human picking between variants in the browser. Treat them as a tuned starting
point, not as derived constants.

## Where it runs, and where it cannot

The burn is WebGL, so `three` is a dependency of `table-client`. It is imported
dynamically: `three` is around 135KB gzipped, the table is served off a Pi to a
TV over the LAN, and none of it is needed to put the felt on screen. Loading it
statically more than doubled the entry bundle; loading it on demand costs the
entry about a kilobyte, and a client that never animates a burn never fetches it
at all.

Two cases cannot run the animation, and both render the same thing:

- **No WebGL.** `supportsWebGL` probes once for a `webgl2` context, and
  `createAshScene` returns `null` if the renderer still throws.
- **Reduced motion.** Every phase collapses to zero, the board deals
  immediately, and no WebGL work happens at all.

Both fall back to `SettledAsh` — the picture the burn ends on anyway, just
already there, deepening with the count. The choice is made **before the first
paint** rather than in an effect, so nothing swaps a canvas in for a fallback a
frame later.

That same static ash is what the component tests see: they render through
`renderToStaticMarkup` with no DOM at all, which is exactly the no-WebGL shape.
It is also why the timing, the field, the footprint squash and the heap live
outside the component in `burnPile.ts` and `burnField.ts` — they are the parts
worth testing, and none of them needs a renderer.

## The burn's lifetime is state, not a derivation

The engine's cascade sends `CardBurned`, `BoardDealt` and `StreetStarted` within
milliseconds of each other, and any one of those re-renders the table. Anything
gated on "the count changed during this render" is gone almost the instant it
appears. `BurnPile` therefore hands the count to a scene that owns its own
clock: a count that *grows* under a running scene sets a card alight, and the
scene runs the burn out on its own time.

A pile that arrives whole — a reconnect mid-hand, a replay seek landing after
two burns — is settled instead, with `settleWhole`. Burns that happened while
nobody was looking are over; replaying three of them on reconnect would show a
fire that is not happening. The scene loads asynchronously, so the count it
settles from is read when the scene is ready rather than when the component
mounted.

A count that *shrinks* is a fresh hand, and the pile resets.
