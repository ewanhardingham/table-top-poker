import type { SoundSettings } from "@table-top-poker/protocol";
import { CUE_FILES, CUE_NAMES, type CueName } from "./cues.js";
import {
  createSoundEngine,
  type HandUpdateArgs,
  type PlaybackHandle,
  type PlaybackOptions,
  type SoundSource,
  type SoundEngine,
} from "./engine.js";
import { realClock } from "./realClock.js";

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

function audioAvailable(): boolean {
  return typeof AudioContext !== "undefined";
}

const silentPlayback: PlaybackHandle = { stop: () => undefined };

async function loadBuffer(cue: CueName): Promise<AudioBuffer | undefined> {
  const cached = buffers.get(cue);
  if (cached) return cached;
  try {
    const response = await fetch(
      `${import.meta.env.BASE_URL}sounds/${CUE_FILES[cue]}`,
    );
    const bytes = await response.arrayBuffer();
    const buffer = await context().decodeAudioData(bytes);
    buffers.set(cue, buffer);
    return buffer;
  } catch (error) {
    console.warn(`sound: could not load cue "${cue}"`, error);
    return undefined;
  }
}

function startBuffer(
  buffer: AudioBuffer,
  options: PlaybackOptions = {},
): PlaybackHandle {
  const c = context();
  const source = c.createBufferSource();
  const gain = c.createGain();
  let finished = false;

  source.buffer = buffer;
  gain.gain.value = options.gain ?? 1;
  source.connect(gain);
  gain.connect(c.destination);
  source.onended = () => {
    finished = true;
  };

  if (options.duration === undefined) {
    if (options.offset === undefined) source.start();
    else source.start(0, options.offset);
  } else {
    source.start(0, options.offset ?? 0, options.duration);
  }

  return {
    stop(): void {
      if (finished) return;
      finished = true;
      source.stop();
    },
  };
}

function playCueSound(cue: CueName, options?: PlaybackOptions): PlaybackHandle {
  if (!audioAvailable()) return silentPlayback;

  let stopped = false;
  let active: PlaybackHandle | undefined;
  const handle: PlaybackHandle = {
    stop(): void {
      stopped = true;
      active?.stop();
    },
  };

  void loadBuffer(cue).then((buffer) => {
    if (!buffer || stopped) return;
    active = startBuffer(buffer, options);
  });

  return handle;
}

export function playAudioBuffer(
  buffer: AudioBuffer,
  options?: PlaybackOptions,
): PlaybackHandle {
  if (!audioAvailable()) return silentPlayback;
  return startBuffer(buffer, options);
}

function playSound(
  source: SoundSource,
  options?: PlaybackOptions,
): PlaybackHandle {
  if (typeof source === "string") return playCueSound(source, options);
  return playAudioBuffer(source, options);
}

const engine = (soundGlobal.__ttpSoundEngine ??= createSoundEngine({
  play: playSound,
  ...realClock,
}));

export type {
  HandUpdateArgs,
  PlaybackHandle,
  PlaybackOptions,
  SoundSource,
  Surface,
} from "./engine.js";

export function onHandUpdate(args: HandUpdateArgs): void {
  engine.onHandUpdate(args);
}

export function applyRoomSoundSettings(settings: SoundSettings): void {
  engine.applyRoomSoundSettings(settings);
}

export function playRevealFlip(): PlaybackHandle {
  return engine.playRevealFlip();
}

export async function unlockAudio(): Promise<void> {
  if (!audioAvailable()) return;
  armSilentKeepAlive();
  await context().resume();
  await Promise.all(
    CUE_NAMES.map((cue) => loadBuffer(cue).catch(() => undefined)),
  );
}

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
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, 1, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate, true);
  dv.setUint16(32, 1, true);
  dv.setUint16(34, 8, true);
  writeAscii(36, "data");
  dv.setUint32(40, numSamples, true);
  for (let i = 0; i < numSamples; i++) dv.setUint8(44 + i, 128);
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

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

if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    if (soundGlobal.__ttpAudioCtx) void soundGlobal.__ttpAudioCtx.resume();
    nudgeKeepAlive();
  });
}
