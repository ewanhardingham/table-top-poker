import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class FakeBufferSource {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  readonly starts: number[][] = [];
  readonly connections: unknown[] = [];
  stopCalls = 0;

  connect(destination: unknown): void {
    this.connections.push(destination);
  }

  start(...args: number[]): void {
    this.starts.push(args);
  }

  stop(): void {
    this.stopCalls++;
  }

  finish(): void {
    this.onended?.();
  }
}

class FakeGainNode {
  readonly gain = { value: 0 };
  readonly connections: unknown[] = [];

  connect(destination: unknown): void {
    this.connections.push(destination);
  }
}

class FakeAudioContext {
  static latest: FakeAudioContext | undefined;
  static decoded: Promise<AudioBuffer> | undefined;

  readonly destination = {};
  readonly sources: FakeBufferSource[] = [];
  readonly gains: FakeGainNode[] = [];
  readonly decodedBuffer = {} as AudioBuffer;

  constructor() {
    FakeAudioContext.latest = this;
  }

  createBufferSource(): FakeBufferSource {
    const source = new FakeBufferSource();
    this.sources.push(source);
    return source;
  }

  createGain(): FakeGainNode {
    const gain = new FakeGainNode();
    this.gains.push(gain);
    return gain;
  }

  decodeAudioData(): Promise<AudioBuffer> {
    return FakeAudioContext.decoded ?? Promise.resolve(this.decodedBuffer);
  }
}

type SoundModule = typeof import("./webAudio.js");

const sharedGlobal = globalThis as unknown as Record<string, unknown>;

function clearSoundGlobal(): void {
  for (const key of [
    "__ttpAudioCtx",
    "__ttpAudioBuffers",
    "__ttpSoundEngine",
    "__ttpSilentKeepAlive",
  ]) {
    Reflect.deleteProperty(sharedGlobal, key);
  }
}

function currentContext(): FakeAudioContext {
  const context = FakeAudioContext.latest;
  if (!context) throw new Error("audio context was not created");
  return context;
}

let sound: SoundModule;

beforeEach(async () => {
  vi.resetModules();
  clearSoundGlobal();
  FakeAudioContext.latest = undefined;
  FakeAudioContext.decoded = undefined;
  vi.stubGlobal("AudioContext", FakeAudioContext);
  sound = await import("./webAudio.js");
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("supplied buffer playback", () => {
  it("applies gain, offset and duration, then stops the source once", () => {
    const buffer = {} as AudioBuffer;
    const handle = sound.playAudioBuffer(buffer, {
      gain: 0.35,
      offset: 0.4,
      duration: 1.2,
    });
    const context = currentContext();
    const source = context.sources[0];
    const gain = context.gains[0];

    expect(source?.buffer).toBe(buffer);
    expect(gain?.gain.value).toBe(0.35);
    expect(source?.starts).toEqual([[0, 0.4, 1.2]]);
    expect(source?.connections).toEqual([gain]);
    expect(gain?.connections).toEqual([context.destination]);

    handle.stop();
    handle.stop();
    expect(source?.stopCalls).toBe(1);
  });

  it("keeps the built-in immediate playback defaults", () => {
    const handle = sound.playAudioBuffer({} as AudioBuffer);
    const context = currentContext();
    const source = context.sources[0];
    const gain = context.gains[0];

    expect(gain?.gain.value).toBe(1);
    expect(source?.starts).toEqual([[]]);
    handle.stop();
    expect(source?.stopCalls).toBe(1);
  });

  it("does not stop a source after it has finished", () => {
    const handle = sound.playAudioBuffer({} as AudioBuffer);
    const source = currentContext().sources[0];

    source?.finish();
    handle.stop();

    expect(source?.stopCalls).toBe(0);
  });
});

describe("named cue loading", () => {
  it("does not create a source when stopped while the cue is decoding", async () => {
    let resolveDecode!: (buffer: AudioBuffer) => void;
    FakeAudioContext.decoded = new Promise<AudioBuffer>((resolve) => {
      resolveDecode = resolve;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        }),
      ),
    );

    const handle = sound.playRevealFlip();
    handle.stop();
    resolveDecode({} as AudioBuffer);
    await FakeAudioContext.decoded;
    await Promise.resolve();

    expect(currentContext().sources).toEqual([]);
  });

  it("starts the decoded cue immediately and keeps its handle stoppable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
        }),
      ),
    );

    const handle = sound.playRevealFlip();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const source = currentContext().sources[0];

    expect(source?.starts).toEqual([[]]);
    handle.stop();
    expect(source?.stopCalls).toBe(1);
  });
});
