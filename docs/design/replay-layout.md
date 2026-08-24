# The felt's scale, and the replay's bands

How the table decides what a felt em is worth, and how the replay divides the
felt between the ring and its own chrome. The numbers here were fitted against
a measured table, not guessed; the measurements are at the end.

## Two scales, not one

Everything on the felt used to size off the root's 16px, so a felt with less
height than the tablet's simply ran out of room: the seat pods and the Board
kept their size while the space between them vanished, and the tabled hands
came down on the community cards. iOS made it worse — `vh` counts the space
Safari's own toolbars occupy, so the replay sized itself for a felt it did not
have.

There are now two scales, both measured against the felt rather than the
viewport (`.felt` is a `container-type: size` container, so `cqh`/`cqw` inside
it read the space the table actually has):

- **The felt unit** (`.felt-surface`'s `font-size`) — what the ring, the Board
  and every card size off. The live table and the replay share the surface, so
  an element is the same size in both, which is the point: a Hand should not
  change size when you scrub back through it.
- **The chrome unit** (`--replay-unit`, see `replay/chrome.ts`) — the Scrub,
  the Caption and nothing else. It is free to shrink faster than the table,
  because a chip that loses a pixel costs nothing and a card that loses one
  costs legibility. Its floor is the touch target, not the type size.

Both are capped at `1rem`, so a felt with room to spare renders exactly as it
always has — the tablet in its home-screen app is at the cap in both
orientations.

## Why the bands are what they are

`posFor` anchors the ring at 10% and 90% of the stage, and a tabled Hand is
dealt *towards* the Board. So a pod's reach is asymmetric: outwards it is half
a plate and a marker (2.21em, measured), inwards it is the fan (6.89em). Four
gaps have to come out even:

```
felt edge → pod   |   pod fan → Board   |   Board → pod fan   |   pod → Caption
```

The first and last are the stage's edge bands plus the ring's own 10%; the
middle two are 40% of the stage less the fan and half the Board (12em tall).
Setting them equal fixes the edge band as a function of the felt:

    band ≈ 0.1875 × (felt − chrome) − 6.675 × felt-unit

which is `EDGE_BAND` in `ReplayStage`, and the felt unit at which the middle
gaps stop shrinking, which is `.felt-surface`'s clamp. Below about 740px of
felt the cap gives way and the table starts to scale; above it the bands do
the work and the cards stay at full size.

The same asymmetry is why the bands are *not* a pod's height: reserving what
the fan needs at the felt's edge, where the fan never goes, is what left a
band of empty felt under the ring while the cards touched the Board.

Back to hands moved to the status bar for the same reason — a control floating
over the felt's top-right corner has to be reserved for whether or not a pod is
near it, and the status bar already carries which Hand is under review.

## Measured

Worst case (every seat tabled), Chromium, 2× DPR, eight seats at a showdown.
Gaps in CSS px, in the order above:

| viewport   | felt em | gaps            | play chip | track |
| ---------- | ------- | --------------- | --------- | ----- |
| 1366×1024  | 16.0    | 81 / 76 / 76 / 81 | 44        | 40    |
| 1366×834   | 16.0    | 37 / 34 / 34 / 37 | 43        | 33    |
| 1366×780   | 15.4    | 27 / 30 / 30 / 27 | 40        | 31    |
| 1024×1310  | 16.0    | 149 × 4           | 44        | 40    |
| 900×600    | 11.5    | 19 / 13 / 13 / 19 | 38        | 30    |

The first two are the tablet in its home-screen app and in Safari with the tab
bar showing; both keep the table at full size. A change to the pod, the Board
or the bands should be re-measured the same way rather than eyeballed.
