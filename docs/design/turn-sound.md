# Turn-sound capture (#276)

The player offers the turn-sound prompt only after a successful seat claim and
only when the page is HTTPS and the browser has the microphone, recorder, and
Web Audio APIs needed to complete the flow. A denied permission follows the
same path as Skip, leaving the normal turn cue unchanged. Reconnecting an
already-claimed seat does not show the prompt again: nothing is stored until a
later ticket wires the confirmed buffer into the room.

`player-client/src/turnSound/capture.ts` is the browser-free capture state
machine. Its reducer owns the three-second cap, the 300ms minimum, peak-level
validation, playback generations, background cancellation, and stale async
result protection. It emits effects for an injected recorder and playback
port, so those rules are unit tested without browser globals.

`turnSound/browser.ts` is the adapter. It requests a short-lived permission
stream on prompt entry, creates a fresh stream for each take, feeds an
`AnalyserNode` for the meter, and stops every microphone track immediately on
release, timeout, cancellation, or teardown. It decodes the completed blob to
an `AudioBuffer` for the shared sound layer's private playback. Pointer capture
keeps a held recording alive when a finger drifts beyond the button; only a
release ends an ordinary take.
