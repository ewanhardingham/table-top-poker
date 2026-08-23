# Sound asset provenance

The canonical production sound set: seven cue files, one per cue, as
**uncompressed PCM WAV** (`-c:a pcm_s16le`, 44.1 kHz stereo).

The set was originally AAC/`.m4a` (the #183 format decision, on the belief that
`decodeAudioData` handled AAC universally). That proved wrong: iOS Safari's
`decodeAudioData` rejected the AAC files on some devices — an iPadOS 27 table
returned "Decoding failed" for every cue while the same build decoded them on an
iPhone. PCM carries no codec for the decoder to refuse, so it decodes on every
surface (Pi Chromium kiosk, iOS Safari, Android Chrome); the clips are short, so
the size cost is a few hundred KB each, warmed once on unlock.

## Naming scheme

One file per cue at the root of this directory, named after the cue in
kebab-case: `<cue>.wav`. No A/B/C alternatives and no other formats are kept
here — the alternatives explored during prototyping live only on the
`proto/sound-181` branch.

## Assets

| Cue | File | Original source | Licence |
|-----|------|-----------------|---------|
| deal | `deal.wav` | Kenney "Casino Audio" — `deal/deal-a__card-slide-1.ogg` | [Kenney CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| board | `board.wav` | Kenney "Casino Audio" — `flip/flip-a__card-place-1.ogg` | [Kenney CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| fold | `fold.wav` | Kenney "Casino Audio" — `fold/fold-a__card-shove-1.ogg` | [Kenney CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| flip | `flip.wav` | Kenney "Casino Audio" — `flip/flip-b__card-place-2.ogg` | [Kenney CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| check | `check.wav` | Original project recording — `check-knock/check-knock__custom.m4a` (fist-on-wood knock) | Own recording — project holds the rights outright |
| yourTurn | `your-turn.wav` | Pixabay sound #269292 — `your-turn/turn-notify__pixabay-269292.mp3` | [Pixabay Content License](https://pixabay.com/service/license-summary/) |
| burn | `burn.wav` | Pixabay sound #317280 — `burn/fire-whoosh__pixabay-317280.mp3` | [Pixabay Content License](https://pixabay.com/service/license-summary/) |

## Licence notes

- **Kenney CC0** — public-domain dedication; no attribution required, no
  restrictions. Four of the six cues (deal, board, fold, flip) come from
  Kenney's "Casino Audio" pack.
- **Check knock (own recording)** — an original fist-on-wood performance
  recorded for this project. No third-party content; the project owns the
  rights outright. Trimmed from 1.323s to 0.530s: the take carried ~0.48s of
  room hiss ahead of the first knock and a comparable stretch after the second
  had decayed into the noise floor, so the cue read as late against the action
  that triggered it. Both knocks and their decay are intact, with a 5ms fade in
  and 30ms fade out over the cuts.
- **Your-turn (Pixabay Content License)** — royalty-free, commercial use
  permitted, no attribution required. Its one restriction is that the **raw
  file may not be redistributed or sold standalone**. That does not bite here:
  the asset ships transcoded and bundled inside the app, which the licence
  permits. It must not be published on its own as a downloadable sound file.
- **Burn (Pixabay Content License)** — same terms as your-turn: royalty-free,
  commercial use permitted, no attribution required, and the raw file must not
  be redistributed standalone. Trimmed from 5.042s to 0.700s. The source is a
  swell rather than a hit: it is silent until 0.71s, becomes audible around
  0.85s and peaks between 1.24s and 1.47s, so there is no attack transient to
  align to the cue's start. The cut runs 0.85s–1.55s, keeping the whole build
  and its peak, with a 5ms fade in and 30ms fade out over the cuts. Level was
  pulled 6dB below a naive peak-normalise, to -8dB peak / -21.7dB mean: a
  sustained whoosh carries far more energy than the card cues' short hits, and
  matching their -1.5dB peak made it blare against them.

## Serving path

Each client stages its copy under `public/sounds/`. Vite copies each client's
`public/` into its `build/`, and `scripts/build-release.sh` stages those bundles
under `packages/server/public/{table,player}`, where `@fastify/static` serves
them same-origin — reachable at `/table/sounds/<cue>.wav` and
`/player/sounds/<cue>.wav`. No build-script change is needed.
