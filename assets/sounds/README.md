# Starter sound palette (throwaway)

Candidate, **license-clear (CC0)** sounds for the tactile-card-sound prototype
([#181](https://github.com/ewanhardingham/table-top-poker/issues/181)),
assembled by [#179](https://github.com/ewanhardingham/table-top-poker/issues/179)
under the map [#177](https://github.com/ewanhardingham/table-top-poker/issues/177).

These are **scratch assets** for A/B-ing cues by ear in the prototype — not a
final, curated production set. Format/size/preloading for the Pi kiosk is a
later decision (see the map's *Not yet specified*).

## Sources & license

**Most** files are **CC0 1.0 (public domain)** by Kenney Vleugels — no
attribution required, personal + commercial use permitted. Full license text
sits beside this file:

- `LICENSE-casino-audio.txt` — Kenney **Casino Audio** pack, <https://kenney.nl/assets/casino-audio>
- `LICENSE-interface-sounds.txt` — Kenney **Interface Sounds** pack, <https://kenney.nl/assets/interface-sounds>

The Kenney files are `.ogg`. Filenames keep the original pack name after `__`
so provenance is traceable (e.g. `deal-a__card-slide-1.ogg` came from the
pack's `card-slide-1.ogg`).

Two exceptions live under `your-turn/`, both added during the #181 prototype
because neither CC0 pack had a good "action on you" sound:

- `your-turn/turn-*__synth.wav` and `check-knock/check-knock__synth.wav` —
  **synthesized from scratch** (public domain, no sampled source) by
  `scripts/synth-knock.py` (wooden knuckle knocks; check is the two-knock
  "knock to check"). Regen with
  `SOUNDS_DIR=assets/sounds python3 scripts/synth-knock.py`.
- `your-turn/turn-notify__pixabay-269292.mp3` (your-turn prompt) and
  `check-knock/knock-*__pixabay-*.mp3` (real fist-on-wood knocks for check) —
  from Pixabay. **Pixabay Content License, NOT CC0** — royalty-free with no
  attribution, but can't be redistributed standalone. **The real build must
  confirm this licence is acceptable or re-source CC0 equivalents.** Sources:
  notification `.../film-special-effects-notification-2-269292/`,
  door knock `.../film-special-effects-door-knock-175164/`,
  knock `.../film-special-effects-knock-knock-knock-40474/` on pixabay.com.

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
