export const MAX_RECORDING_MS = 3_000;
export const MIN_RECORDING_MS = 300;
export const SILENCE_PEAK_THRESHOLD = 0.02;

export type CaptureHint = "hold-to-record" | "recording-error";

export interface CapturePlayback {
  readonly stop: () => void;
}

export interface CaptureRecordingSession<Take> {
  readonly stop: () => Promise<Take>;
  readonly discard: () => void;
}

export interface CaptureEffects<Take> {
  readonly now: () => number;
  readonly schedule: (fn: () => void, delayMs: number) => () => void;
  readonly start: (
    onLevel: (level: number) => void,
  ) => Promise<CaptureRecordingSession<Take>>;
  readonly play: (take: Take, onEnded: () => void) => CapturePlayback;
  readonly onConfirm: (take: Take) => void;
}

export interface IdleCaptureState {
  readonly phase: "idle";
  readonly sessionId: number;
  readonly playbackId: number;
  readonly hint: CaptureHint | null;
}

export interface StartingCaptureState {
  readonly phase: "starting";
  readonly sessionId: number;
  readonly playbackId: number;
}

export interface RecordingCaptureState {
  readonly phase: "recording";
  readonly sessionId: number;
  readonly playbackId: number;
  readonly startedAt: number;
  readonly elapsedMs: number;
  readonly level: number;
  readonly peakLevel: number;
}

export interface ProcessingCaptureState {
  readonly phase: "processing";
  readonly sessionId: number;
  readonly playbackId: number;
  readonly durationMs: number;
  readonly peakLevel: number;
}

export interface ReviewingCaptureState<Take> {
  readonly phase: "reviewing";
  readonly sessionId: number;
  readonly playbackId: number;
  readonly take: Take;
  readonly durationMs: number;
  readonly peakLevel: number;
  readonly audible: boolean;
  readonly playing: boolean;
}

export type CaptureState<Take> =
  | IdleCaptureState
  | StartingCaptureState
  | RecordingCaptureState
  | ProcessingCaptureState
  | ReviewingCaptureState<Take>;

export type CaptureEvent<Take> =
  | { readonly type: "pressed" }
  | {
      readonly type: "started";
      readonly sessionId: number;
      readonly at: number;
    }
  | {
      readonly type: "level";
      readonly sessionId: number;
      readonly at: number;
      readonly level: number;
    }
  | {
      readonly type: "released";
      readonly sessionId: number;
      readonly at: number;
    }
  | {
      readonly type: "timed-out";
      readonly sessionId: number;
      readonly at: number;
    }
  | {
      readonly type: "take-ready";
      readonly sessionId: number;
      readonly take: Take;
    }
  | { readonly type: "take-failed"; readonly sessionId: number }
  | {
      readonly type: "playback-ended";
      readonly sessionId: number;
      readonly playbackId: number;
    }
  | { readonly type: "replay" }
  | { readonly type: "rerecord" }
  | { readonly type: "cancelled" }
  | { readonly type: "backgrounded" }
  | { readonly type: "confirmed" };

export type CaptureEffect<Take> =
  | { readonly type: "start"; readonly sessionId: number }
  | { readonly type: "schedule-timeout"; readonly sessionId: number }
  | { readonly type: "finish"; readonly sessionId: number }
  | { readonly type: "discard"; readonly sessionId: number }
  | { readonly type: "stop-playback" }
  | {
      readonly type: "play";
      readonly sessionId: number;
      readonly playbackId: number;
      readonly take: Take;
    }
  | { readonly type: "confirm"; readonly take: Take };

export interface CaptureTransition<Take> {
  readonly state: CaptureState<Take>;
  readonly effects: readonly CaptureEffect<Take>[];
}

function idle(
  sessionId: number,
  playbackId: number,
  hint: CaptureHint | null = null,
): IdleCaptureState {
  return { phase: "idle", sessionId, playbackId, hint };
}

export function initialCaptureState<Take>(): CaptureState<Take> {
  return idle(0, 0);
}

function clampLevel(level: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(level) ? level : 0));
}

function elapsedSince(startedAt: number, at: number): number {
  return Math.min(MAX_RECORDING_MS, Math.max(0, at - startedAt));
}

function matchesSession(
  state: CaptureState<unknown>,
  sessionId: number,
): boolean {
  return state.sessionId === sessionId;
}

export function reduceCapture<Take>(
  state: CaptureState<Take>,
  event: CaptureEvent<Take>,
): CaptureTransition<Take> {
  switch (event.type) {
    case "pressed":
      if (state.phase !== "idle") return { state, effects: [] };
      {
        const sessionId = state.sessionId + 1;
        return {
          state: {
            phase: "starting",
            sessionId,
            playbackId: state.playbackId,
          },
          effects: [{ type: "start", sessionId }],
        };
      }

    case "started":
      if (
        state.phase !== "starting" ||
        !matchesSession(state, event.sessionId)
      ) {
        return { state, effects: [] };
      }
      return {
        state: {
          phase: "recording",
          sessionId: event.sessionId,
          playbackId: state.playbackId,
          startedAt: event.at,
          elapsedMs: 0,
          level: 0,
          peakLevel: 0,
        },
        effects: [{ type: "schedule-timeout", sessionId: event.sessionId }],
      };

    case "level":
      if (
        state.phase !== "recording" ||
        !matchesSession(state, event.sessionId)
      ) {
        return { state, effects: [] };
      }
      {
        const level = clampLevel(event.level);
        return {
          state: {
            ...state,
            elapsedMs: elapsedSince(state.startedAt, event.at),
            level,
            peakLevel: Math.max(state.peakLevel, level),
          },
          effects: [],
        };
      }

    case "released":
    case "timed-out":
      if (
        state.phase === "starting" &&
        matchesSession(state, event.sessionId)
      ) {
        return {
          state: idle(state.sessionId, state.playbackId, "hold-to-record"),
          effects: [{ type: "discard", sessionId: event.sessionId }],
        };
      }
      if (
        state.phase !== "recording" ||
        !matchesSession(state, event.sessionId)
      ) {
        return { state, effects: [] };
      }
      {
        const durationMs = elapsedSince(state.startedAt, event.at);
        if (durationMs < MIN_RECORDING_MS) {
          return {
            state: idle(state.sessionId, state.playbackId, "hold-to-record"),
            effects: [{ type: "discard", sessionId: event.sessionId }],
          };
        }
        return {
          state: {
            phase: "processing",
            sessionId: state.sessionId,
            playbackId: state.playbackId,
            durationMs,
            peakLevel: state.peakLevel,
          },
          effects: [{ type: "finish", sessionId: event.sessionId }],
        };
      }

    case "take-ready":
      if (
        state.phase !== "processing" ||
        !matchesSession(state, event.sessionId)
      ) {
        return { state, effects: [] };
      }
      {
        const playbackId = state.playbackId + 1;
        return {
          state: {
            phase: "reviewing",
            sessionId: state.sessionId,
            playbackId,
            take: event.take,
            durationMs: state.durationMs,
            peakLevel: state.peakLevel,
            audible: state.peakLevel >= SILENCE_PEAK_THRESHOLD,
            playing: true,
          },
          effects: [
            {
              type: "play",
              sessionId: state.sessionId,
              playbackId,
              take: event.take,
            },
          ],
        };
      }

    case "take-failed":
      if (
        state.phase === "starting" &&
        matchesSession(state, event.sessionId)
      ) {
        return {
          state: idle(state.sessionId, state.playbackId, "recording-error"),
          effects: [],
        };
      }
      if (
        state.phase !== "processing" ||
        !matchesSession(state, event.sessionId)
      ) {
        return { state, effects: [] };
      }
      return {
        state: idle(state.sessionId, state.playbackId, "recording-error"),
        effects: [],
      };

    case "playback-ended":
      if (
        state.phase !== "reviewing" ||
        state.sessionId !== event.sessionId ||
        state.playbackId !== event.playbackId
      ) {
        return { state, effects: [] };
      }
      return { state: { ...state, playing: false }, effects: [] };

    case "replay":
      if (state.phase !== "reviewing") return { state, effects: [] };
      {
        const playbackId = state.playbackId + 1;
        return {
          state: { ...state, playbackId, playing: true },
          effects: [
            { type: "stop-playback" },
            {
              type: "play",
              sessionId: state.sessionId,
              playbackId,
              take: state.take,
            },
          ],
        };
      }

    case "rerecord":
      if (state.phase !== "reviewing") return { state, effects: [] };
      return {
        state: idle(state.sessionId, state.playbackId),
        effects: [{ type: "stop-playback" }],
      };

    case "cancelled":
      if (state.phase === "idle") return { state, effects: [] };
      if (state.phase === "reviewing") {
        return {
          state: idle(state.sessionId, state.playbackId),
          effects: [{ type: "stop-playback" }],
        };
      }
      if (state.phase === "processing") {
        return { state: idle(state.sessionId, state.playbackId), effects: [] };
      }
      return {
        state: idle(state.sessionId, state.playbackId),
        effects: [{ type: "discard", sessionId: state.sessionId }],
      };

    case "backgrounded":
      if (state.phase === "starting" || state.phase === "recording") {
        return {
          state: idle(state.sessionId, state.playbackId),
          effects: [{ type: "discard", sessionId: state.sessionId }],
        };
      }
      return { state, effects: [] };

    case "confirmed":
      if (state.phase !== "reviewing" || !state.audible) {
        return { state, effects: [] };
      }
      return {
        state: idle(state.sessionId, state.playbackId),
        effects: [
          { type: "stop-playback" },
          { type: "confirm", take: state.take },
        ],
      };
  }
}

export interface CaptureMachine<Take> {
  readonly state: CaptureState<Take>;
  readonly subscribe: (
    listener: (state: CaptureState<Take>) => void,
  ) => () => void;
  readonly press: () => void;
  readonly release: () => void;
  readonly cancel: () => void;
  readonly replay: () => void;
  readonly rerecord: () => void;
  readonly confirm: () => void;
  readonly background: () => void;
  readonly dispose: () => void;
}

export function createCaptureMachine<Take>(
  effects: CaptureEffects<Take>,
): CaptureMachine<Take> {
  let state = initialCaptureState<Take>();
  let disposed = false;
  let activeSession: CaptureRecordingSession<Take> | null = null;
  let playback: CapturePlayback | null = null;
  let cancelTimeout: (() => void) | null = null;
  const pendingStarts = new Set<number>();
  const cancelledStarts = new Set<number>();
  const listeners = new Set<(next: CaptureState<Take>) => void>();

  function clearTimeout(): void {
    cancelTimeout?.();
    cancelTimeout = null;
  }

  function notify(): void {
    for (const listener of listeners) listener(state);
  }

  function discardSession(sessionId: number): void {
    cancelledStarts.add(sessionId);
    if (state.sessionId !== sessionId) return;
    activeSession?.discard();
    activeSession = null;
  }

  function finishSession(sessionId: number): void {
    clearTimeout();
    const session = activeSession;
    activeSession = null;
    if (session === null || state.sessionId !== sessionId) return;
    let stopped: Promise<Take>;
    try {
      stopped = session.stop();
    } catch {
      dispatch({ type: "take-failed", sessionId });
      return;
    }
    void stopped
      .then((take) => {
        dispatch({ type: "take-ready", sessionId, take });
      })
      .catch(() => {
        dispatch({ type: "take-failed", sessionId });
      });
  }

  function stopPlayback(): void {
    playback?.stop();
    playback = null;
  }

  function playTake(sessionId: number, playbackId: number, take: Take): void {
    stopPlayback();
    playback = effects.play(take, () => {
      dispatch({ type: "playback-ended", sessionId, playbackId });
    });
  }

  function startSession(sessionId: number): void {
    pendingStarts.add(sessionId);
    let started: Promise<CaptureRecordingSession<Take>>;
    try {
      started = effects.start((level) => {
        dispatch({
          type: "level",
          sessionId,
          at: effects.now(),
          level,
        });
      });
    } catch {
      pendingStarts.delete(sessionId);
      dispatch({ type: "take-failed", sessionId });
      return;
    }
    void started
      .then((session) => {
        pendingStarts.delete(sessionId);
        if (
          disposed ||
          cancelledStarts.has(sessionId) ||
          state.phase !== "starting" ||
          state.sessionId !== sessionId
        ) {
          session.discard();
          return;
        }
        activeSession = session;
        dispatch({ type: "started", sessionId, at: effects.now() });
      })
      .catch(() => {
        pendingStarts.delete(sessionId);
        dispatch({ type: "take-failed", sessionId });
      });
  }

  function execute(effect: CaptureEffect<Take>): void {
    switch (effect.type) {
      case "start":
        startSession(effect.sessionId);
        break;
      case "schedule-timeout":
        clearTimeout();
        cancelTimeout = effects.schedule(() => {
          dispatch({
            type: "timed-out",
            sessionId: effect.sessionId,
            at: effects.now(),
          });
        }, MAX_RECORDING_MS);
        break;
      case "finish":
        finishSession(effect.sessionId);
        break;
      case "discard":
        clearTimeout();
        discardSession(effect.sessionId);
        break;
      case "stop-playback":
        stopPlayback();
        break;
      case "play":
        playTake(effect.sessionId, effect.playbackId, effect.take);
        break;
      case "confirm":
        effects.onConfirm(effect.take);
        break;
    }
  }

  function dispatch(event: CaptureEvent<Take>): void {
    if (disposed) return;
    const transition = reduceCapture(state, event);
    state = transition.state;
    notify();
    for (const effect of transition.effects) execute(effect);
  }

  return {
    get state() {
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    press() {
      dispatch({ type: "pressed" });
    },
    release() {
      if (state.phase !== "starting" && state.phase !== "recording") return;
      dispatch({
        type: "released",
        sessionId: state.sessionId,
        at: effects.now(),
      });
    },
    cancel() {
      dispatch({ type: "cancelled" });
    },
    replay() {
      dispatch({ type: "replay" });
    },
    rerecord() {
      dispatch({ type: "rerecord" });
    },
    confirm() {
      dispatch({ type: "confirmed" });
    },
    background() {
      dispatch({ type: "backgrounded" });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout();
      activeSession?.discard();
      activeSession = null;
      for (const sessionId of pendingStarts) cancelledStarts.add(sessionId);
      stopPlayback();
      listeners.clear();
    },
  };
}
