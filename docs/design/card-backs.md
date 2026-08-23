# Card backs

Face-down cards render one of nine selectable designs:

- **Heritage** — dense rosette and filigree ornament, closest to a traditional
  casino deck.
- **Deco** — bold diamond geometry with the clearest read at small table scale.
  The default.
- **Botanical** — engraved acanthus linework with a softer, more crafted feel.
- **Waves** — indigo Japanese-inspired wave ornament.
- **Bauhaus** — bold modernist circles and blocks.
- **Atomic** — playful mid-century orbits and starbursts.
- **Mosaic** — intricate emerald geometric tilework.
- **Celestial** — moonlit astronomical engraving.
- **Weave** — restrained monochrome ribbons.

The setting lives in `localStorage`, stored independently by the table client
(`ttp:table-card-back`) and the player client (`ttp:player-card-back`). It is a
per-display preference, not table state: changing one display never changes
another device, and nothing about it crosses the wire.

## Artwork

The artwork was generated as original raster imagery and downsampled to
700 × 1000. Each design ships twice:

- `<id>.webp` — the full card back, quality 86.
- `<id>-thumb.webp` — 112 × 160, quality 80, used for the picker swatches so
  that opening a settings panel does not pull the full-size set.

Both are opaque WebP. The originals were 8-bit RGBA PNGs totalling 13.2 MB
across the nine designs, bundled into *both* clients; the alpha channel was
fully opaque in every one and the picker used the full-size images as 48px
swatches. Flattening and re-encoding brought the set to 1.9 MB, an 86%
reduction. Re-encode from the source rasters rather than from these files if
the artwork is ever revised.
