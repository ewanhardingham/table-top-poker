// Covers the iOS interruption-recovery ladder in `webAudio.ts` (#228): what
// happens when another app takes the audio session mid-game and the page comes
// back to a context that no longer makes sound. The browser side is faked —
// there is no `AudioContext` under the node environment — so these tests are
// about the ladder's decisions (resume, rebuild, wait for a gesture), not about
// Web Audio itself.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type StateName = "suspended" | "running" | "closed" | "interrupted";

/** A minimal `addEventListener`/dispatch pair, enough for the module's use. */
function eventTarget(): {
  addEventListener: (type: string, fn: () => void) => void;
  dispatch: (type: string) => void;
} {
  const listeners = new Map<string, (() => void)[]>();
  return {
    addEventListener: (type, fn) => {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    dispatch: (type) => {
      for (const fn of listeners.get(type) ?? []) fn();
    },
  };
}

class FakeAudioContext {
  static created: FakeAudioContext[] = [];
  /** iOS-wide gate: false models a page with no audio permission right now. */
  static audioAllowed = true;
  state: StateName = "suspended";
  /** Set false to model Safari holding the interruption against `resume()`. */
  resumable = true;
  /** Buffers handed to `start()` — the proof a cue actually made sound. */
  started: unknown[] = [];
  destination = {};
  private readonly events = eventTarget();
  readonly addEventListener = this.events.addEventListener;

  constructor() {
    FakeAudioContext.created.push(this);
  }

  private setState(next: StateName): void {
    this.state = next;
    this.events.dispatch("statechange");
  }

  /** Model the interruption: parked, and deaf to `resume()` until released. */
  interrupt(): void {
    this.resumable = false;
    this.setState("interrupted");
  }

  resume(): Promise<void> {
    if (!this.resumable || !FakeAudioContext.audioAllowed)
      return Promise.reject(new Error("interrupted"));
    this.setState("running");
    return Promise.resolve();
  }

  close(): Promise<void> {
    this.setState("closed");
    return Promise.resolve();
  }

  decodeAudioData(bytes: ArrayBuffer): Promise<AudioBuffer> {
    return Promise.resolve(bytes as unknown as AudioBuffer);
  }

  createBufferSource(): {
    buffer: unknown;
    connect: () => void;
    start: () => void;
  } {
    const source = {
      buffer: null as unknown,
      connect: (): void => undefined,
      start: (): void => {
        this.started.push(source.buffer);
      },
    };
    return source;
  }
}

class FakeAudioElement {
  paused = true;
  loop = false;
  src = "";
  /** Set false to model iOS refusing `play()` outside a user gesture. */
  playable = true;
  setAttribute(): void {
    // `playsinline` has no bearing on the fake.
  }
  play(): Promise<void> {
    if (!this.playable) return Promise.reject(new Error("gesture required"));
    this.paused = false;
    return Promise.resolve();
  }
}

let documentEvents = eventTarget();
let windowEvents = eventTarget();
let keepAlive: FakeAudioElement;

/**
 * Install the browser fakes and import a fresh copy of the module. The module
 * pins its context, buffers and engine to `globalThis`, so every `__ttp*` key
 * has to go along with the module registry for a test to start clean.
 */
async function loadModule(): Promise<typeof import("./webAudio.js")> {
  FakeAudioContext.created = [];
  FakeAudioContext.audioAllowed = true;
  keepAlive = new FakeAudioElement();
  documentEvents = eventTarget();
  windowEvents = eventTarget();
  const g = globalThis as Record<string, unknown>;
  for (const key of Object.keys(g)) {
    if (key.startsWith("__ttp")) Reflect.deleteProperty(g, key);
  }

  g.AudioContext = FakeAudioContext;
  g.document = {
    visibilityState: "visible",
    addEventListener: documentEvents.addEventListener,
    createElement: () => keepAlive,
  };
  g.window = { addEventListener: windowEvents.addEventListener };
  g.fetch = () =>
    Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) });

  vi.resetModules();
  return import("./webAudio.js");
}

function currentContext(): FakeAudioContext {
  const ctx = FakeAudioContext.created.at(-1);
  if (!ctx) throw new Error("no AudioContext was created");
  return ctx;
}

/**
 * Let the recovery ladder's retries and their backoff run to completion — the
 * resume retries alone span ~900ms, and a rebuild runs a second set.
 */
async function settle(): Promise<void> {
  const g = globalThis as Record<string, unknown>;
  const deadline = Date.now() + 8000;
  // Poll the module's own in-flight flag rather than sleeping out the whole
  // backoff: the ladder is done when nothing is recovering and the microtasks
  // behind it (the cue's buffer lookup) have drained.
  for (let quiet = 0; quiet < 3 && Date.now() < deadline;) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    quiet = g.__ttpAudioRecovering ? 0 : quiet + 1;
  }
}

const SLOW = 20_000;

describe("webAudio interruption recovery", () => {
  let sound: typeof import("./webAudio.js");

  beforeEach(async () => {
    sound = await loadModule();
    await sound.unlockAudio();
  });

  afterEach(() => {
    const g = globalThis as Record<string, unknown>;
    delete g.AudioContext;
    delete g.document;
    delete g.window;
    delete g.fetch;
  });

  it(
    "plays cues once unlocked",
    async () => {
      expect(currentContext().state).toBe("running");
      sound.playRevealFlip();
      await settle();
      expect(currentContext().started).toHaveLength(1);
    },
    SLOW,
  );

  it(
    "never plays through an interrupted context",
    async () => {
      const ctx = currentContext();
      FakeAudioContext.audioAllowed = false;
      ctx.interrupt();

      sound.playRevealFlip();
      await settle();

      expect(ctx.started).toHaveLength(0);
    },
    SLOW,
  );

  it(
    "resumes on return to the tab once the interruption lifts",
    async () => {
      const ctx = currentContext();
      FakeAudioContext.audioAllowed = false;
      ctx.interrupt();
      keepAlive.paused = true;

      // While the other app still holds the session, the state change alone
      // must not throw the context away — the rebuild is saved for the return.
      await settle();
      expect(ctx.state).not.toBe("running");
      expect(FakeAudioContext.created).toHaveLength(1);

      FakeAudioContext.audioAllowed = true;
      ctx.resumable = true;
      documentEvents.dispatch("visibilitychange");
      await settle();

      expect(ctx.state).toBe("running");
      expect(keepAlive.paused).toBe(false);
      expect(FakeAudioContext.created).toHaveLength(1);

      sound.playRevealFlip();
      await settle();
      expect(ctx.started).toHaveLength(1);
    },
    SLOW,
  );

  it(
    "rebuilds the context when resume stays refused",
    async () => {
      const dead = currentContext();
      FakeAudioContext.audioAllowed = false;
      dead.interrupt();
      await settle();

      // Back on the page, with a context iOS will never resume again.
      FakeAudioContext.audioAllowed = true;
      documentEvents.dispatch("visibilitychange");
      await settle();

      expect(FakeAudioContext.created).toHaveLength(2);
      const fresh = currentContext();
      expect(fresh).not.toBe(dead);
      expect(fresh.state).toBe("running");

      sound.playRevealFlip();
      await settle();
      expect(fresh.started).toHaveLength(1);
      expect(dead.started).toHaveLength(0);
    },
    SLOW,
  );

  it(
    "recovers on the next tap when every automatic path failed",
    async () => {
      const ctx = currentContext();
      FakeAudioContext.audioAllowed = false;
      ctx.interrupt();
      keepAlive.paused = true;
      keepAlive.playable = false; // no gesture credit left

      documentEvents.dispatch("visibilitychange");
      await settle();
      expect(currentContext().state).not.toBe("running");

      // The user taps: iOS hands audio back, and the capture-phase listener
      // spends that gesture on the ladder.
      FakeAudioContext.audioAllowed = true;
      keepAlive.playable = true;
      documentEvents.dispatch("pointerdown");
      await settle();

      expect(currentContext().state).toBe("running");
      expect(keepAlive.paused).toBe(false);
    },
    SLOW,
  );
});
