# Starter sound palette (throwaway)

Candidate, **license-clear (CC0)** sounds for the tactile-card-sound prototype
([#181](https://github.com/ewanhardingham/table-top-poker/issues/181)),
assembled by [#179](https://github.com/ewanhardingham/table-top-poker/issues/179)
under the map [#177](https://github.com/ewanhardingham/table-top-poker/issues/177).

These are **scratch assets** for A/B-ing cues by ear in the prototype — not a
final, curated production set. Format/size/preloading for the Pi kiosk is a
later decision (see the map's *Not yet specified*).

## Sources & license

Every file is **CC0 1.0 (public domain)** by Kenney Vleugels — no attribution
required, personal + commercial use permitted. Full license text sits beside
this file:

- `LICENSE-casino-audio.txt` — Kenney **Casino Audio** pack, <https://kenney.nl/assets/casino-audio>
- `LICENSE-interface-sounds.txt` — Kenney **Interface Sounds** pack, <https://kenney.nl/assets/interface-sounds>

All files are `.ogg`. Filenames keep the original pack name after `__` so
provenance is traceable (e.g. `deal-a__card-slide-1.ogg` came from the pack's
`card-slide-1.ogg`).

## Cues (a couple of options each to A/B)

| Cue          | Options                                              | Pack      | Notes |
|--------------|-----------------------------------------------------|-----------|-------|
| **deal**     | `card-slide-1`, `card-slide-3`                      | Casino    | single card sliding across felt (HoleCardsDealt / BoardDealt) |
| **flip**     | `card-place-1`, `card-place-2`, `card-fan-1` (board)| Casino    | card turned face up; `card-fan` for the multi-card board reveal |
| **fold**     | `card-shove-1`, `card-shove-3`                      | Casino    | cards mucked / shoved away (ActionTaken{fold}) |
| **check-knock** | `drop_003`, `bong_001`                           | Interface | knuckle-knock on the table — no literal knock in either CC0 pack, so approximated by a low thud / bong. Flagged as the weakest match; may want a real foley knock later. |
| **your-turn**| `question_001`, `pluck_002`                         | Interface | soft attention chime (derived from the view's actor) |
| **showdown** | `confirmation_001`, `maximize_004`                  | Interface | reveal flourish (ShowdownReached) |
| **bonus: hand-start** | `card-shuffle`                             | Casino    | optional shuffle on HandStarted — not a required cue, included since it fits |

### Caveat for the prototype

The card foley (deal/flip/fold/shuffle) is genuine physical card sound and
should feel tactile immediately. **check-knock has no true match** in these two
CC0 packs — the drop/bong stand-ins are placeholders; if neither lands, source a
dedicated CC0 knock (or synthesize one) during the prototype.
