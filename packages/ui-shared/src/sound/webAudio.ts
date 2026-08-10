// Production Web Audio effects for the tactile-sound layer (#186): one
// `AudioContext` singleton, a warm-decoded buffer per cue, gesture unlock and
// the iOS silent-switch workaround. This is the thin, browser-bound half — the
// tuned event→cue logic lives in the pure `engine.ts`. Both clients import the
// bound API (`onHandUpdate`, `applyRoomSoundSettings`, `playRevealFlip`,
// `unlockAudio`) from here.
import type { SoundSettings } from "@table-top-poker/protocol";
import { CUE_FILES, CUE_NAMES, type CueName } from "./cues.js";
import {
  createSoundEngine,
  type HandUpdateArgs,
  type SoundEngine,
} from "./engine.js";
import { realClock } from "./realClock.js";

// Pin the context, buffer cache and engine to `globalThis`. This module is a
// stateful singleton shared by the WS hook and the hole-card hook; a partial
// HMR update can otherwise leave those importers on different module instances,
// each with its own suspended context, so a cue plays through a context the
// gesture never unlocked. One instance on the global keeps every importer —
// however HMR splits them — driving the same audio.
const soundGlobal = globalThis as unknown as {
  __ttpAudioCtx?: AudioContext | null;
  __ttpAudioBuffers?: Map<CueName, AudioBuffer>;
  __ttpSoundEngine?: SoundEngine;
  __ttpSilentKeepAlive?: HTMLAudioElement | null;
};

const buffers = (soundGlobal.__ttpAudioBuffers ??= new Map<
  CueName,
  AudioBuffer
>());

function context(): AudioContext {
  return (soundGlobal.__ttpAudioCtx ??= new AudioContext());
}

/** Whether Web Audio exists — false under jsdom/SSR, where the layer is inert. */
function audioAvailable(): boolean {
  return typeof AudioContext !== "undefined";
}

async function loadBuffer(cue: CueName): Promise<AudioBuffer | undefined> {
  const cached = buffers.get(cue);
  if (cached) return cached;
  // Base-relative, not root-absolute: the assets are staged under each client's
  // deploy base (`/table/sounds/…`, `/player/sounds/…`) in a release build, so a
  // bare `/sounds/…` only resolves in dev, where Vite serves `public/` at the
  // root. `import.meta.env.BASE_URL` ("/" in dev, "/table/" | "/player/" in the
  // build) makes the URL land on the staged asset on both.
  try {
    const response = await fetch(
      `${import.meta.env.BASE_URL}sounds/${CUE_FILES[cue]}`,
    );
    const bytes = await response.arrayBuffer();
    const buffer = await context().decodeAudioData(bytes);
    buffers.set(cue, buffer);
    return buffer;
  } catch (error) {
    // A missing or undecodable asset must not become an unhandled rejection —
    // the cue just stays silent. (WAV assets decode everywhere, so this is a
    // belt-and-braces guard; see the format note in `cues.ts`.)
    console.warn(`sound: could not load cue "${cue}"`, error);
    return undefined;
  }
}

/**
 * The engine's `play` sink: fire a cue's warm-decoded buffer. Inert without
 * Web Audio (jsdom under vitest, SSR) so importing the layer never throws on
 * `new AudioContext()`. Cues are warmed on unlock, so by playtime the buffer is
 * cached and this resolves without a decode gap.
 */
function playCueSound(cue: CueName): void {
  if (!audioAvailable()) return;
  void loadBuffer(cue).then((buffer) => {
    if (!buffer) return;
    const c = context();
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.connect(c.destination);
    source.start();
  });
}

const engine = (soundGlobal.__ttpSoundEngine ??= createSoundEngine({
  play: playCueSound,
  ...realClock,
}));

export type { HandUpdateArgs, Surface } from "./engine.js";

/** Called on every `hand-update` (never `view-snapshot`) — see `engine.ts`. */
export function onHandUpdate(args: HandUpdateArgs): void {
  engine.onHandUpdate(args);
}

/** Mirror the room-view sound settings (#182) into the engine's gate. */
export function applyRoomSoundSettings(settings: SoundSettings): void {
  engine.applyRoomSoundSettings(settings);
}

/** The reveal/conceal flip cue — the player's hole-card hook calls this. */
export function playRevealFlip(): void {
  engine.playRevealFlip();
}

/**
 * Unlock audio from a user gesture (#178: an `AudioContext` starts
 * `suspended`, and mobile browsers refuse to start one outside a gesture).
 * Resumes the context, arms the iOS silent-switch workaround and warm-decodes
 * every cue buffer so the first real cue has no decode gap. Idempotent — safe
 * to call from every gesture that might be the first.
 */
export async function unlockAudio(): Promise<void> {
  if (!audioAvailable()) return;
  armSilentKeepAlive();
  await context().resume();
  // Warm every cue so the first real one plays without a decode gap.
  await Promise.all(
    CUE_NAMES.map((cue) => loadBuffer(cue).catch(() => undefined)),
  );
}

// --- iOS silent-switch workaround (#178) ------------------------------------
//
// On iOS the hardware ringer/silent switch mutes Web Audio, so a phone with the
// ringer off would hear nothing. A silently-looping HTMLMediaElement plays
// through the media channel, which the switch does not gate, and keeping one
// active routes Web Audio to that same channel — so the cues survive the switch
// being off. Armed on the unlock gesture (media playback needs a gesture too).

/** A fraction of a second of 8-bit mono PCM silence, as a `data:` WAV URL. */
function silentWavDataUrl(): string {
  const sampleRate = 8000;
  const numSamples = Math.floor(sampleRate * 0.25);
  const buffer = new ArrayBuffer(44 + numSamples);
  const dv = new DataView(buffer);
  const writeAscii = (offset: number, text: string): void => {
    for (let i = 0; i < text.length; i++)
      dv.setUint8(offset + i, text.charCodeAt(i));
  };
  writeAscii(0, "RIFF");
  dv.setUint32(4, 36 + numSamples, true);
  writeAscii(8, "WAVE");
  writeAscii(12, "fmt ");
  dv.setUint32(16, 16, true); // PCM chunk size
  dv.setUint16(20, 1, true); // PCM format
  dv.setUint16(22, 1, true); // mono
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate, true); // byte rate (8-bit mono)
  dv.setUint16(32, 1, true); // block align
  dv.setUint16(34, 8, true); // bits per sample
  writeAscii(36, "data");
  dv.setUint32(40, numSamples, true);
  // 8-bit PCM silence is the mid-point 128, not 0.
  for (let i = 0; i < numSamples; i++) dv.setUint8(44 + i, 128);
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

/** Nudge the keep-alive element back to playing; a no-op if it isn't armed. */
function nudgeKeepAlive(): void {
  void soundGlobal.__ttpSilentKeepAlive?.play().catch(() => undefined);
}

function armSilentKeepAlive(): void {
  if (typeof document === "undefined") return;
  if (!soundGlobal.__ttpSilentKeepAlive) {
    const el = document.createElement("audio");
    el.loop = true;
    el.setAttribute("playsinline", "");
    el.src = silentWavDataUrl();
    soundGlobal.__ttpSilentKeepAlive = el;
  }
  nudgeKeepAlive();
}

// Returning to a backgrounded tab (a phone waking) can leave the context
// suspended; re-resume on visibility and nudge the keep-alive back to playing.
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (soundGlobal.__ttpAudioCtx) void soundGlobal.__ttpAudioCtx.resume();
    nudgeKeepAlive();
  });
}
