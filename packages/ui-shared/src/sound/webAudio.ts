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
  __ttpAudioRecovering?: boolean;
  __ttpAudioListenersArmed?: boolean;
  __ttpAudioEverRunning?: boolean;
  __ttpAudioRecreatedAt?: number;
};

const buffers = (soundGlobal.__ttpAudioBuffers ??= new Map<
  CueName,
  AudioBuffer
>());

function context(): AudioContext {
  const existing = soundGlobal.__ttpAudioCtx;
  if (existing) return existing;
  const created = new AudioContext();
  soundGlobal.__ttpAudioCtx = created;
  watchContextState(created);
  return created;
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
  // A cue can be the first thing to notice the context died under us — iOS
  // interrupts it when another app takes the audio session, and nothing else
  // may have fired since. Recover first, then play through whatever context
  // recovery left us on (it may be a fresh one, so read it after the await).
  void ensureRunning()
    .then(() => loadBuffer(cue))
    .then((buffer) => {
      if (!buffer) return;
      const c = context();
      if (c.state !== "running") return;
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
  await ensureRunning();
  await warmCues();
}

/** Warm every cue so the first real one plays without a decode gap. */
async function warmCues(): Promise<void> {
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

/**
 * Nudge the keep-alive element back to playing; a no-op if it isn't armed.
 * Resolves false when the browser refused (iOS rejects `play()` outside a
 * gesture once an interruption has paused the element), which is the signal
 * that only the next real tap can put the media channel back.
 */
async function nudgeKeepAlive(): Promise<boolean> {
  const el = soundGlobal.__ttpSilentKeepAlive;
  if (!el) return false;
  if (!el.paused) return true;
  try {
    await el.play();
    return true;
  } catch {
    return false;
  }
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
  void nudgeKeepAlive();
}

// --- interruption recovery (iOS Safari, #228) -------------------------------
//
// Playing other media — an Instagram video, a call, another tab — takes the
// audio session away from this page. iOS then parks the `AudioContext` in
// Safari's non-standard `"interrupted"` state (older versions: `"suspended"`)
// and pauses the silent keep-alive element. Coming back to the tab does not
// undo either on its own: a single `resume()` right after foregrounding is
// routinely ignored, and a context that stays interrupted plays every buffer
// source into silence — which is exactly the "sounds never come back" symptom.
//
// So recovery is a ladder, tried in order and re-entered from every signal we
// get (visibility, pageshow, focus, context state changes, and the next cue):
//   1. restart the keep-alive element and `resume()` the context, retrying a
//      few times because the first attempt after foregrounding tends to no-op;
//   2. if it is still not running, throw the context away and build a fresh
//      one — an interruption Safari refuses to lift only clears with a new
//      context — re-decoding the cues against it;
//   3. if even that fails (no gesture credit left), leave it: the capture-phase
//      gesture listeners below re-run the ladder on the user's very next tap,
//      which is the one moment iOS reliably grants audio again.

const RESUME_ATTEMPTS = 3;
const RESUME_BACKOFF_MS = 150;
const RECREATE_COOLDOWN_MS = 5000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    realClock.schedule(() => {
      resolve();
    }, ms);
  });
}

/** Whether the context exists and is actually able to make sound right now. */
function contextRunning(): boolean {
  const running = soundGlobal.__ttpAudioCtx?.state === "running";
  if (running) soundGlobal.__ttpAudioEverRunning = true;
  return running;
}

/** `resume()` the live context, retrying — the first call after a wake no-ops. */
async function resumeContext(): Promise<boolean> {
  const c = soundGlobal.__ttpAudioCtx;
  if (!c) return false;
  for (let attempt = 0; attempt < RESUME_ATTEMPTS; attempt++) {
    if (contextRunning()) return true;
    try {
      await c.resume();
    } catch {
      // Safari rejects `resume()` while the interruption is still held; the
      // retry below (or the next gesture) is the real fix.
    }
    if (contextRunning()) return true;
    await delay(RESUME_BACKOFF_MS * (attempt + 1));
  }
  return contextRunning();
}

/**
 * Replace a context that will not come back. The decoded buffers go with it:
 * an `AudioBuffer` is portable between contexts on paper, but Safari has been
 * unreliable about it, and re-decoding is cheap against the HTTP cache.
 */
async function recreateContext(): Promise<void> {
  const dead = soundGlobal.__ttpAudioCtx;
  soundGlobal.__ttpAudioCtx = null;
  buffers.clear();
  if (dead && dead.state !== "closed") {
    try {
      await dead.close();
    } catch {
      // A context iOS has already torn down can refuse to close; dropping the
      // reference is what matters.
    }
  }
  const fresh = context();
  await resumeContext();
  if (fresh.state === "running") await warmCues();
}

/**
 * Bring audio back if it has stalled. Cheap and safe to call from anywhere —
 * it returns immediately when the context is already running, and collapses
 * overlapping calls (visibility + focus + a cue all fire at once on a wake).
 */
async function ensureRunning(options?: {
  allowRecreate?: boolean;
}): Promise<void> {
  if (!audioAvailable()) return;
  if (contextRunning() && !soundGlobal.__ttpSilentKeepAlive?.paused) return;
  if (soundGlobal.__ttpAudioRecovering) return;
  soundGlobal.__ttpAudioRecovering = true;
  try {
    await nudgeKeepAlive();
    context();
    if (await resumeContext()) return;
    if (options?.allowRecreate === false) return;
    // Only rebuild a context that was working before: a context still waiting
    // for its first unlock gesture is *meant* to be suspended, and replacing it
    // would just churn.
    if (!soundGlobal.__ttpAudioEverRunning) return;
    // Rebuilding is only worth a try while the user is looking at the page —
    // hidden, the interruption is probably still being held by whatever they
    // switched to, and a rebuild would burn the cooldown before the return.
    if (pageHidden()) return;
    const since = realClock.now() - (soundGlobal.__ttpAudioRecreatedAt ?? 0);
    if (since < RECREATE_COOLDOWN_MS) return;
    soundGlobal.__ttpAudioRecreatedAt = realClock.now();
    await recreateContext();
  } finally {
    soundGlobal.__ttpAudioRecovering = false;
  }
}

function pageHidden(): boolean {
  return (
    typeof document !== "undefined" && document.visibilityState === "hidden"
  );
}

/**
 * Safari reports interruptions through `statechange`. Recovering straight away
 * is usually refused while the other app still holds the session, but it costs
 * one attempt and wins the case where the interruption has already ended.
 */
function watchContextState(ctx: AudioContext): void {
  if (typeof ctx.addEventListener !== "function") return;
  ctx.addEventListener("statechange", () => {
    if (ctx !== soundGlobal.__ttpAudioCtx) return;
    if (ctx.state === "running") return;
    // Resume only: the interruption is usually still held by whatever took the
    // session, so this is a cheap "has it already ended?" check. Rebuilding is
    // left to the signals that mean the user is actually back.
    void ensureRunning({ allowRecreate: false });
  });
}

// Every signal that the page is back in front of the user, plus a capture-phase
// gesture listener as the last resort: `passive`/`capture` keeps it out of the
// way of the app's own handlers, and it does nothing at all while audio is
// healthy, so the common path is one state read per tap.
if (typeof document !== "undefined" && !soundGlobal.__ttpAudioListenersArmed) {
  soundGlobal.__ttpAudioListenersArmed = true;

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    void ensureRunning();
  });
  window.addEventListener("pageshow", () => void ensureRunning());
  window.addEventListener("focus", () => void ensureRunning());

  const onGesture = (): void => {
    if (!audioAvailable()) return;
    // Only spend work when something is actually wrong — and only once the
    // context exists, so a tap before the unlock gesture stays a no-op.
    if (!soundGlobal.__ttpAudioCtx) return;
    if (contextRunning() && !soundGlobal.__ttpSilentKeepAlive?.paused) return;
    void ensureRunning();
  };
  for (const type of ["pointerdown", "touchend", "click"] as const) {
    document.addEventListener(type, onGesture, {
      capture: true,
      passive: true,
    });
  }
}
