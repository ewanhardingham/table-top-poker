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
  /** iOS-wide gate: false models the audio session being held by another app. */
  static audioAllowed = true;
  /**
   * True only inside the synchronous run of a tap handler. iOS grants audio to
   * the task a gesture started, so a `resume()` issued after an `await` has no
   * credit — modelling that is the point, since losing it is silence from the
   * first hand rather than only after an interruption.
   */
  static inGesture = false;
  state: StateName = "suspended";
  /** A context that has never run needs a gesture for its first resume. */
  needsGesture = true;
  /** Set true for the interruption Safari never lifts on this context. */
  dead = false;
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

  /** Model the interruption: parked, and deaf to `resume()` while held. */
  interrupt(): void {
    FakeAudioContext.audioAllowed = false;
    this.setState("interrupted");
  }

  resume(): Promise<void> {
    if (this.dead || !FakeAudioContext.audioAllowed)
      return Promise.reject(new Error("interrupted"));
    if (this.needsGesture && !FakeAudioContext.inGesture)
      return Promise.reject(new Error("gesture required"));
    this.needsGesture = false;
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
  /** Records whether each `play()` landed inside a gesture. */
  playedInGesture: boolean[] = [];
  setAttribute(): void {
    // `playsinline` has no bearing on the fake.
  }
  play(): Promise<void> {
    this.playedInGesture.push(FakeAudioContext.inGesture);
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
  FakeAudioContext.inGesture = false;
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

function restoreGlobals(): void {
  const g = globalThis as Record<string, unknown>;
  for (const key of ["AudioContext", "document", "window", "fetch"]) {
    Reflect.deleteProperty(g, key);
  }
}

/**
 * Run `fn` the way a tap handler runs: the gesture's credit covers only what
 * `fn` does synchronously, exactly as iOS scopes it to the task.
 */
function inGesture<T>(fn: () => T): T {
  FakeAudioContext.inGesture = true;
  try {
    return fn();
  } finally {
    FakeAudioContext.inGesture = false;
  }
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

describe("webAudio unlock", () => {
  let sound: typeof import("./webAudio.js");

  beforeEach(async () => {
    sound = await loadModule();
  });

  afterEach(restoreGlobals);

  it(
    "unlocks from the tap that asked for it",
    async () => {
      await inGesture(() => sound.unlockAudio());

      expect(currentContext().state).toBe("running");
      // The keep-alive's `play()` has to land inside the gesture too, or the
      // media channel that carries Web Audio past the silent switch is lost.
      expect(keepAlive.playedInGesture[0]).toBe(true);

      sound.playRevealFlip();
      await settle();
      expect(currentContext().started).toHaveLength(1);
    },
    SLOW,
  );

  it(
    "cannot unlock without a gesture",
    async () => {
      await sound.unlockAudio();
      expect(currentContext().state).not.toBe("running");
    },
    SLOW,
  );

  it(
    "ignores wake signals until the app has asked to unlock",
    async () => {
      // `focus` and `pageshow` both fire at load. Acting on them would build a
      // context outside any gesture and hold the recovery guard across the
      // real unlock tap, so the tap would find recovery busy and skip its
      // resume — silence from the first hand.
      windowEvents.dispatch("focus");
      windowEvents.dispatch("pageshow");
      documentEvents.dispatch("visibilitychange");
      await settle();
      expect(FakeAudioContext.created).toHaveLength(0);

      await inGesture(() => sound.unlockAudio());
      expect(currentContext().state).toBe("running");
    },
    SLOW,
  );
});

describe("webAudio interruption recovery", () => {
  let sound: typeof import("./webAudio.js");

  beforeEach(async () => {
    sound = await loadModule();
    await inGesture(() => sound.unlockAudio());
  });

  afterEach(restoreGlobals);

  it(
    "never plays through an interrupted context",
    async () => {
      const ctx = currentContext();
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
      ctx.interrupt();
      keepAlive.paused = true;

      // While the other app still holds the session, the state change alone
      // must not throw the context away — the rebuild is saved for the return.
      await settle();
      expect(ctx.state).not.toBe("running");
      expect(FakeAudioContext.created).toHaveLength(1);

      FakeAudioContext.audioAllowed = true;
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
    "rebuilds the context on a tap when resume stays refused",
    async () => {
      const dead = currentContext();
      dead.dead = true; // the interruption Safari will never lift
      dead.interrupt();
      keepAlive.paused = true;
      await settle(); // time away, with the other app holding the session

      // Coming back: the automatic run finds resume refused, and marks it.
      FakeAudioContext.audioAllowed = true;
      documentEvents.dispatch("visibilitychange");
      await settle();
      expect(dead.state).not.toBe("running");

      // The next tap rebuilds and resumes inside that one gesture.
      inGesture(() => {
        documentEvents.dispatch("pointerdown");
      });
      await settle();

      expect(FakeAudioContext.created).toHaveLength(2);
      const fresh = currentContext();
      expect(fresh).not.toBe(dead);
      expect(fresh.state).toBe("running");
      expect(keepAlive.paused).toBe(false);

      sound.playRevealFlip();
      await settle();
      expect(fresh.started).toHaveLength(1);
      expect(dead.started).toHaveLength(0);
    },
    SLOW,
  );

  it(
    "recovers on the next tap when the automatic paths could not",
    async () => {
      const ctx = currentContext();
      ctx.interrupt();
      keepAlive.paused = true;
      keepAlive.playable = false; // no gesture credit for the element either

      documentEvents.dispatch("visibilitychange");
      await settle();
      expect(currentContext().state).not.toBe("running");

      // The user taps: iOS hands the session back, and the capture-phase
      // listener spends that gesture on the ladder.
      FakeAudioContext.audioAllowed = true;
      keepAlive.playable = true;
      inGesture(() => {
        documentEvents.dispatch("pointerdown");
      });
      await settle();

      expect(currentContext().state).toBe("running");
      expect(keepAlive.paused).toBe(false);
    },
    SLOW,
  );

  it(
    "keeps cues flowing through a rebuilt context",
    async () => {
      const dead = currentContext();
      dead.dead = true;
      dead.interrupt();
      await settle();
      FakeAudioContext.audioAllowed = true;

      // Two runs: the first marks the resume refused, the tap rebuilds.
      documentEvents.dispatch("visibilitychange");
      await settle();
      inGesture(() => {
        documentEvents.dispatch("pointerdown");
      });
      await settle();

      // The rebuild dropped the buffer cache; recovery re-warms it, so the
      // next cue still plays.
      sound.playRevealFlip();
      await settle();
      expect(currentContext().started).toHaveLength(1);
    },
    SLOW,
  );
});
