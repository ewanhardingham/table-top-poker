# PROTOTYPE — player-side position marker

**Throwaway.** Delete this whole directory (plus
`packages/player-client/prototype-position-marker.html` and the
`proto:position-marker` script in the root `package.json`) once the question
below is answered.

## The question

Where and how should the player's phone show that *they* are on the dealer
button, the small blind or the big blind — in a style consistent with the
markers the table already shows on its seat pods?

## Run it

```
npm run proto:position-marker
```

Opens Vite on `/prototype-position-marker.html`. Switch variants from the bar
along the bottom; the URL carries `?variant=…&position=…` so a particular view
can be shared or reloaded.

## What's real and what isn't

- **Real:** the badge itself (`PositionMarker.tsx` is lifted verbatim from
  `table-client/src/Seats.tsx` — same diameter/font-size split, same
  `color.buttonMarker` / `blindSmallMarker` / `blindBigMarker`, same
  `shadow.card`), the design tokens, `playerTopPillStyle`, the real `Card`.
- **Real, and worth knowing:** `PlayerView` already carries `button`,
  `smallBlind`, `bigBlind` and `dealtSeatCount` on every non-`no-hand` phase
  (`engine/src/view.ts`), so **no protocol or server change is needed** — this
  is purely a rendering decision.
- **Fake:** the screen around it (`MockPlayerScreen.tsx`) — a static stand-in
  for `StatusBar` + `Hand` + `ActionBar`, with no store, socket or gestures.

## Suppression rules carried over from the table

`Prototype.tsx` copies `Seats.markerFor`, so the two suppressions the table
already makes (issue #160, decision 4) can be checked here too:

- `phase: no-hand` → only the button shows.
- heads-up (`dealtSeatCount === 2`) → only the button shows, no SB/BB.

Toggle both from the bottom bar. The open question they raise for the player
screen: on the table those rules stop *two markers landing on one seat*. On the
player screen you only ever see your own, so heads-up suppression means a
player who is the small blind is shown nothing at all. Consistency with the
table may not be the right call here.

## Variants

| id | idea |
| --- | --- |
| `seat-pill-corner` | badge hung off the corner of the "Seat 3" pill — the table's exact move |
| `seat-pill-inline` | same disc, riding inside the pill |
| `top-row-chip` | its own pill in the top row: disc + the word |
| `banner-dot` | takes over the turn banner's status dot |
| `under-banner-strip` | a dedicated strip with the word and what it implies |
| `over-cards` | a physical-looking chip beside the hole cards |
