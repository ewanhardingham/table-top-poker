# Clients and ui-shared

Cross-cutting rationale for the player client, table client, and shared UI
(`packages/player-client`, `packages/table-client`, `packages/ui-shared`).
Per-component layout and styling choices live in the code; this captures the
non-obvious, load-bearing decisions. The hole-card surface has its own note in
[`holecards.md`](holecards.md).

## Tactile sound (#186)

Split into a pure engine and a browser-bound half so the event→cue mapping is
unit-testable without Web Audio:

- **`ui-shared/sound/engine.ts`** — a pure state machine over injected effects
  (`play`, `now`, `schedule`). Cue ownership (revised #180): a **phone** voices
  only its *own* two hole cards, plus its own fold/check/flip and your-turn
  prompt; the **table** is the community voice and voices only the shared board,
  staying silent through the deal. Multi-card deals fire one cue per card,
  staggered (`dealStaggerMs` wider than `boardStaggerMs`) so they read as
  distinct. The your-turn prompt is edge-detected (fires once when the turn
  arrives, not per view) and **deferred** until the deal sweep finishes
  (`lastHoleCardAt + turnAfterDealMs`) so cards land first; a `turnToken`
  cancels a stale deferred prompt if the player acts or the hand ends before it
  fires.
- **Sounds fire only from `hand-update`, never `view-snapshot`** (the WS hooks
  enforce this by only calling `onHandUpdate` for the former), so a
  reconnect/refresh mid-hand can't replay a burst of cues (#175). The engine
  never sees a snapshot.
- **`ui-shared/sound/webAudio.ts`** — the production effects: one `AudioContext`,
  a warm-decoded buffer per cue, gesture unlock. The context, buffer cache, and
  engine are pinned to `globalThis` because the module is a stateful singleton
  shared by the WS hook and the hole-card hook — a partial HMR update could
  otherwise leave importers on different instances, each with its own suspended
  context, so a cue would play through a context the gesture never unlocked.
  `unlockAudio` (idempotent, called from any gesture that might be first) resumes
  the context, arms the iOS workaround, and warm-decodes every cue so the first
  real cue has no decode gap. The same adapter plays a supplied `AudioBuffer`
  through a gain node with optional offset and duration in seconds, returning a
  handle that can stop it. Inert without Web Audio (jsdom/SSR).
- **iOS silent-switch workaround (#178):** the hardware ringer switch mutes Web
  Audio. A silently-looping `HTMLAudioElement` plays through the media channel
  (which the switch doesn't gate), and keeping one active routes Web Audio to
  that channel too. Armed on the unlock gesture; re-nudged on visibility change
  (a woken phone can leave the context suspended).
- **Assets are WAV/PCM, not AAC** (`cues.ts`, #185): iOS Safari's
  `decodeAudioData` rejected the AAC set on some devices ("Decoding failed" on an
  iPadOS table while an iPhone decoded the same build); PCM needs no codec and
  decodes everywhere. Asset URLs are base-relative (`import.meta.env.BASE_URL`)
  so they resolve under each client's deploy base (`/table/…`, `/player/…`) in a
  release build and at root in dev. `call`/`raise` cues are unallocated (no chip
  asset yet). Cue → room-settings category mapping lives in `CUE_CATEGORY`;
  `cueAllowed` is the real mute path (master switch + category, #182).

## iOS viewport lock (`player-client/lockViewport.ts`)

iOS Safari lets the user pinch-zoom and pan the visual viewport even when the
page forbids it: `user-scalable=no` has been ignored since iOS 10, and
`touch-action: manipulation` only kills double-tap zoom. What *does* work on
WebKit is cancelling the non-standard `gesturestart`/`gesturechange`/`gestureend`
events and any multi-touch `touchmove` before it becomes a zoom or pan — both
need **non-passive** listeners or the `preventDefault` is dropped. Single-touch
moves are left alone: the hole-card peel is a one-finger drag that does its own
`preventDefault`. This is why Android stays locked with the meta tag alone while
iPhone needs this shim.

## WebSocket reconnect

A socket receives one fresh **snapshot** on connect (`view-snapshot`), never
event replay (Phase 1 spec #130 §7, §9) — which is also why sound is gated to
`hand-update`. A reconnecting seat resumes silently with no penalty; the server
clears its presence badge. A player reconnecting after a positional repack
(ADR-0004) may still hold the pre-repack seat in localStorage, so the client
handles a `seat-moved` resync notice; the token, not the stored position,
authenticates.

## Rendering (`ui-shared`)

`ui-shared` deliberately holds **no gesture concepts** — bend/turn/peel live in
the player client (see `holecards.md`). The shared `Card`, theme tokens, and
position marker are the whole cross-surface surface. Theme values are TypeScript
tokens (not just CSS variables) because components style inline from them and
there is no CSS-variable bridge; a cross-surface change is a one-token edit.
