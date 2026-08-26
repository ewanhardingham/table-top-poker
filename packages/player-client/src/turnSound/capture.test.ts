import { describe, expect, it, vi } from "vitest";
import {
  createCaptureMachine,
  initialCaptureState,
  MAX_RECORDING_MS,
  MIN_RECORDING_MS,
  reduceCapture,
  SILENCE_PEAK_THRESHOLD,
  type CaptureEffects,
  type CaptureRecordingSession,
} from "./capture.js";

interface TestTake {
  readonly id: string;
}

function recordingState() {
  const starting = reduceCapture(initialCaptureState<TestTake>(), {
    type: "pressed",
  });
  return reduceCapture(starting.state, {
    type: "started",
    sessionId: 1,
    at: 0,
  });
}

function session(take: TestTake = { id: "take" }) {
  return {
    stop: vi.fn(() => Promise.resolve(take)),
    discard: vi.fn(),
  };
}

function fakeEffects() {
  let now = 0;
  let levelListener: ((level: number) => void) | null = null;
  const timers: (() => void)[] = [];
  const activeSession = session();
  const playback = { stop: vi.fn() };
  const effects: CaptureEffects<TestTake> = {
    now: () => now,
    schedule: (fn: () => void) => {
      timers.push(fn);
      return () => undefined;
    },
    start: vi.fn((onLevel: (level: number) => void) => {
      levelListener = onLevel;
      return Promise.resolve(activeSession);
    }),
    play: vi.fn(() => playback),
    onConfirm: vi.fn(),
  };
  return {
    effects,
    activeSession,
    playback,
    timers,
    setNow(value: number) {
      now = value;
    },
    setLevel(value: number) {
      levelListener?.(value);
    },
  };
}

describe("reduceCapture", () => {
  it("discards a tap shorter than the minimum and exposes a hold hint", () => {
    const recording = recordingState();
    const stopped = reduceCapture(recording.state, {
      type: "released",
      sessionId: 1,
      at: MIN_RECORDING_MS - 1,
    });

    expect(stopped.state).toMatchObject({
      phase: "idle",
      hint: "hold-to-record",
    });
    expect(stopped.effects).toEqual([{ type: "discard", sessionId: 1 }]);
  });

  it("finishes at three seconds and never lets progress exceed the cap", () => {
    const recording = recordingState();
    const levelled = reduceCapture(recording.state, {
      type: "level",
      sessionId: 1,
      at: MAX_RECORDING_MS + 500,
      level: 0.4,
    });
    const stopped = reduceCapture(levelled.state, {
      type: "timed-out",
      sessionId: 1,
      at: MAX_RECORDING_MS,
    });

    expect(levelled.state).toMatchObject({
      elapsedMs: MAX_RECORDING_MS,
      peakLevel: 0.4,
    });
    expect(stopped.state).toMatchObject({
      phase: "processing",
      durationMs: MAX_RECORDING_MS,
    });
    expect(stopped.effects).toEqual([{ type: "finish", sessionId: 1 }]);
  });

  it("keeps a silent take for review while blocking confirmation", () => {
    const recording = recordingState();
    const stopped = reduceCapture(recording.state, {
      type: "released",
      sessionId: 1,
      at: MIN_RECORDING_MS,
    });
    const ready = reduceCapture(stopped.state, {
      type: "take-ready",
      sessionId: 1,
      take: { id: "silent" },
    });

    expect(ready.state).toMatchObject({
      phase: "reviewing",
      audible: false,
      playing: true,
    });
    expect(ready.effects).toHaveLength(1);
    expect(reduceCapture(ready.state, { type: "confirmed" }).effects).toEqual(
      [],
    );
    expect(SILENCE_PEAK_THRESHOLD).toBeGreaterThan(0);
  });

  it("stops old playback before replaying and ignores stale playback completion", () => {
    const recording = recordingState();
    const stopped = reduceCapture(recording.state, {
      type: "released",
      sessionId: 1,
      at: MIN_RECORDING_MS,
    });
    const ready = reduceCapture(stopped.state, {
      type: "take-ready",
      sessionId: 1,
      take: { id: "audible" },
    });
    const reviewed = {
      ...ready.state,
      peakLevel: SILENCE_PEAK_THRESHOLD,
      audible: true,
    };
    const replayed = reduceCapture(reviewed, { type: "replay" });

    expect(replayed.effects).toEqual([
      { type: "stop-playback" },
      {
        type: "play",
        sessionId: 1,
        playbackId: 2,
        take: { id: "audible" },
      },
    ]);
    expect(
      reduceCapture(replayed.state, {
        type: "playback-ended",
        sessionId: 1,
        playbackId: 1,
      }).state,
    ).toBe(replayed.state);
  });

  it("discards a recording when the page backgrounds", () => {
    const recording = recordingState();
    const backgrounded = reduceCapture(recording.state, {
      type: "backgrounded",
    });

    expect(backgrounded.state).toMatchObject({ phase: "idle" });
    expect(backgrounded.effects).toEqual([{ type: "discard", sessionId: 1 }]);
  });
});

describe("createCaptureMachine", () => {
  it("starts, auto-stops, plays once, and confirms an audible take", async () => {
    const fake = fakeEffects();
    const machine = createCaptureMachine(fake.effects);

    machine.press();
    await Promise.resolve();
    expect(machine.state.phase).toBe("recording");
    fake.setLevel(0.5);
    fake.setNow(MAX_RECORDING_MS);
    fake.timers[0]?.();
    expect(machine.state.phase).toBe("processing");

    await Promise.resolve();
    expect(machine.state).toMatchObject({
      phase: "reviewing",
      audible: true,
      playing: true,
    });
    expect(fake.effects.play).toHaveBeenCalledOnce();

    machine.confirm();
    expect(fake.effects.onConfirm).toHaveBeenCalledWith({ id: "take" });
    expect(fake.playback.stop).toHaveBeenCalledOnce();
  });

  it("discards a start that resolves after the finger has been released", async () => {
    let resolveStart!: (value: CaptureRecordingSession<TestTake>) => void;
    const delayed = session();
    const fake = fakeEffects();
    const delayedEffects: CaptureEffects<TestTake> = {
      ...fake.effects,
      start: vi.fn(
        () =>
          new Promise<CaptureRecordingSession<TestTake>>((resolve) => {
            resolveStart = resolve;
          }),
      ),
    };
    const machine = createCaptureMachine(delayedEffects);

    machine.press();
    machine.release();
    resolveStart(delayed);
    await Promise.resolve();

    expect(machine.state.phase).toBe("idle");
    expect(delayed.discard).toHaveBeenCalledOnce();
  });
});
