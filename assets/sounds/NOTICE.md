# Sound asset provenance

The canonical production sound set: six cue files, one per cue, encoded as **AAC
in an `.m4a` container** (`-c:a aac -b:a 160k`). AAC is the only lossy codec
`decodeAudioData` handles universally across the Pi Chromium kiosk, all iOS
Safari, and Android Chrome — see the format decision in issue #183.

## Naming scheme

One file per cue at the root of this directory, named after the cue in
kebab-case: `<cue>.m4a`. No A/B/C alternatives and no non-AAC formats are kept
here — the alternatives explored during prototyping live only on the
`proto/sound-181` branch.

## Assets

| Cue | File | Original source | Licence |
|-----|------|-----------------|---------|
| deal | `deal.m4a` | Kenney "Casino Audio" — `deal/deal-a__card-slide-1.ogg` | [Kenney CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| board | `board.m4a` | Kenney "Casino Audio" — `flip/flip-a__card-place-1.ogg` | [Kenney CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| fold | `fold.m4a` | Kenney "Casino Audio" — `fold/fold-a__card-shove-1.ogg` | [Kenney CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| flip | `flip.m4a` | Kenney "Casino Audio" — `flip/flip-b__card-place-2.ogg` | [Kenney CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| check | `check.m4a` | Original project recording — `check-knock/check-knock__custom.m4a` (fist-on-wood knock) | Own recording — project holds the rights outright |
| yourTurn | `your-turn.m4a` | Pixabay sound #269292 — `your-turn/turn-notify__pixabay-269292.mp3` | [Pixabay Content License](https://pixabay.com/service/license-summary/) |

## Licence notes

- **Kenney CC0** — public-domain dedication; no attribution required, no
  restrictions. Four of the six cues (deal, board, fold, flip) come from
  Kenney's "Casino Audio" pack.
- **Check knock (own recording)** — an original fist-on-wood performance
  recorded for this project. No third-party content; the project owns the
  rights outright.
- **Your-turn (Pixabay Content License)** — royalty-free, commercial use
  permitted, no attribution required. Its one restriction is that the **raw
  file may not be redistributed or sold standalone**. That does not bite here:
  the asset ships transcoded and bundled inside the app, which the licence
  permits. It must not be published on its own as a downloadable sound file.

## Serving path

Each client stages its copy under `public/sounds/`. Vite copies each client's
`public/` into its `build/`, and `scripts/build-release.sh` stages those bundles
under `packages/server/public/{table,player}`, where `@fastify/static` serves
them same-origin — reachable at `/table/sounds/<cue>.m4a` and
`/player/sounds/<cue>.m4a`. No build-script change is needed.
