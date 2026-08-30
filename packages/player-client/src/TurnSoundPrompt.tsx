import {
  PillButton,
  color,
  font,
  fontSize,
  radius,
} from "@table-top-poker/ui-shared";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { InlineError } from "./InlineError.js";
import {
  createCaptureMachine,
  initialCaptureState,
  MAX_RECORDING_MS,
  type CaptureState,
} from "./turnSound/capture.js";
import {
  createBrowserCaptureEffects,
  microphoneRecordingAvailable,
  requestMicrophonePermission,
} from "./turnSound/browser.js";
import type { RecordedTurnSoundTake } from "./turnSound/model.js";

export interface TurnSoundPromptProps {
  readonly onConfirmed: (take: RecordedTurnSoundTake) => void;
  readonly onSkipped: () => void;
  readonly onPermissionDenied: () => void;
}

type PermissionState = "requesting" | "granted";

const promptStyle: CSSProperties = {
  flex: 1,
  minHeight: 0,
  overflow: "auto",
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: "0 22px 26px",
};

const headingStyle: CSSProperties = {
  margin: 0,
  color: color.text,
  fontFamily: font.display,
  fontSize: fontSize.lg,
  fontWeight: 800,
  lineHeight: 1.15,
};

const descriptionStyle: CSSProperties = {
  margin: 0,
  fontSize: fontSize.md,
  lineHeight: 1.5,
  color: color.textMuted,
};

const subStyle: CSSProperties = {
  fontFamily: font.mono,
  fontSize: fontSize.xs,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: color.textDim,
  lineHeight: 1.1,
};

const stageStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 12,
  padding: "6px 0",
};

const meterStyle: CSSProperties = {
  width: "100%",
  height: 10,
  overflow: "hidden",
  border: `1px solid ${color.border}`,
  borderRadius: radius.pill,
  background: color.control,
};

const meterFillStyle: CSSProperties = {
  height: "100%",
  borderRadius: radius.pill,
  background: `linear-gradient(90deg, ${color.accentDeep}, ${color.accentBright})`,
  transition: "width 80ms linear",
};

const durationStyle: CSSProperties = {
  fontFamily: font.mono,
  fontSize: fontSize.sm,
  letterSpacing: "0.04em",
  color: color.textDim,
};

const actionsStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 10,
  padding: "15px 16px 16px",
  border: `1px solid ${color.accentBorder}`,
  borderRadius: radius.control,
  background: color.accentWash,
};

function ringStyle(progress: number): CSSProperties {
  return {
    width: "min(174px, 60%)",
    aspectRatio: "1",
    padding: 6,
    borderRadius: radius.pill,
    background: `conic-gradient(${color.accentBright} ${String(
      progress * 360,
    )}deg, ${color.border} 0deg)`,
    boxShadow: `0 0 0 1px ${color.border}`,
  };
}

const recordButtonStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  border: `1px solid ${color.accentBorder}`,
  borderRadius: radius.pill,
  background: color.surfaceGradient,
  color: color.text,
  fontFamily: font.body,
  fontSize: fontSize.md,
  fontWeight: 700,
  lineHeight: 1.2,
  cursor: "pointer",
  touchAction: "none",
  userSelect: "none",
};

function clampProgress(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function durationLabel(durationMs: number): string {
  return `${(durationMs / 1000).toFixed(1)}s / 3.0s`;
}

function stateProgress(state: CaptureState<RecordedTurnSoundTake>): number {
  if (state.phase === "recording") {
    return clampProgress(state.elapsedMs / MAX_RECORDING_MS);
  }
  if (state.phase === "processing" || state.phase === "reviewing") {
    return clampProgress(state.durationMs / MAX_RECORDING_MS);
  }
  return 0;
}

export function TurnSoundPrompt({
  onConfirmed,
  onSkipped,
  onPermissionDenied,
}: TurnSoundPromptProps) {
  const [permission, setPermission] = useState<PermissionState>("requesting");
  const onConfirmedRef = useRef(onConfirmed);
  onConfirmedRef.current = onConfirmed;

  useEffect(() => {
    let active = true;
    if (!microphoneRecordingAvailable()) {
      onPermissionDenied();
      return () => {
        active = false;
      };
    }

    void requestMicrophonePermission().then(
      () => {
        if (active) setPermission("granted");
      },
      () => {
        if (active) onPermissionDenied();
      },
    );
    return () => {
      active = false;
    };
  }, [onPermissionDenied]);

  const effects = useMemo(
    () =>
      permission === "granted"
        ? createBrowserCaptureEffects((take) => {
            onConfirmedRef.current(take);
          })
        : null,
    [permission],
  );
  const machine = useMemo(
    () => (effects === null ? null : createCaptureMachine(effects)),
    [effects],
  );
  const [captureState, setCaptureState] =
    useState<CaptureState<RecordedTurnSoundTake> | null>(null);

  useEffect(() => {
    if (machine === null) return;
    setCaptureState(machine.state);
    const unsubscribe = machine.subscribe(setCaptureState);
    return () => {
      unsubscribe();
      machine.cancel();
    };
  }, [machine]);

  useEffect(() => {
    if (machine === null) return;
    const onVisibilityChange = (): void => {
      if (document.visibilityState === "hidden") machine.background();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [machine]);

  const state =
    captureState ??
    machine?.state ??
    initialCaptureState<RecordedTurnSoundTake>();
  const pointerId = useRef<number | null>(null);
  const progress = stateProgress(state);
  const recordingState = state.phase === "recording" ? state : null;
  const reviewingState = state.phase === "reviewing" ? state : null;
  const level = recordingState?.level ?? 0;
  const buttonLabel =
    state.phase === "starting"
      ? "Starting…"
      : state.phase === "recording"
        ? "Release to stop"
        : state.phase === "processing"
          ? "Preparing…"
          : state.phase === "reviewing"
            ? "Take recorded"
            : "Hold to record";
  const recordButtonDisabled =
    state.phase === "processing" || state.phase === "reviewing";

  const skip = (): void => {
    machine?.cancel();
    onSkipped();
  };

  const pointerDown = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (machine === null || state.phase !== "idle" || event.button !== 0) {
      return;
    }
    pointerId.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    machine.press();
  };

  const pointerUp = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (pointerId.current !== event.pointerId) return;
    pointerId.current = null;
    machine?.release();
  };

  const pointerCancelled = (
    event: React.PointerEvent<HTMLButtonElement>,
  ): void => {
    if (pointerId.current !== event.pointerId) return;
    pointerId.current = null;
    machine?.cancel();
  };

  return (
    <section data-testid="turn-sound-prompt" style={promptStyle}>
      <h1 style={headingStyle}>Make your turn sound</h1>
      <p style={descriptionStyle}>
        Hold the button while you record. The table plays it back when it&apos;s
        your turn, and you can listen before you keep it.
      </p>

      {permission === "requesting" ? (
        <div data-testid="turn-sound-permission" style={stageStyle}>
          <div style={subStyle}>Setting up the microphone</div>
        </div>
      ) : (
        <>
          <div style={stageStyle}>
            <div
              data-testid="turn-sound-record-ring"
              data-progress={progress.toFixed(3)}
              style={ringStyle(progress)}
            >
              <button
                type="button"
                data-testid="turn-sound-record-button"
                data-state={state.phase}
                aria-label="Hold to record your turn sound"
                aria-pressed={
                  state.phase === "starting" || state.phase === "recording"
                }
                disabled={recordButtonDisabled}
                onPointerDown={pointerDown}
                onPointerUp={pointerUp}
                onPointerCancel={pointerCancelled}
                onLostPointerCapture={pointerCancelled}
                style={{
                  ...recordButtonStyle,
                  ...(recordButtonDisabled
                    ? { color: color.disabledText, cursor: "default" }
                    : {}),
                }}
              >
                {buttonLabel}
              </button>
            </div>
            <div
              data-testid="turn-sound-level-meter"
              role="meter"
              aria-label="Microphone level"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(level * 100)}
              style={meterStyle}
            >
              <div
                style={{ ...meterFillStyle, width: `${String(level * 100)}%` }}
              />
            </div>
            <div data-testid="turn-sound-progress" style={durationStyle}>
              {recordingState
                ? durationLabel(recordingState.elapsedMs)
                : reviewingState
                  ? durationLabel(reviewingState.durationMs)
                  : "Up to 3.0s"}
            </div>
          </div>

          {state.phase === "idle" && state.hint !== null && (
            <InlineError
              testId="turn-sound-hint"
              message={
                state.hint === "hold-to-record"
                  ? "Hold to record a little longer."
                  : "We couldn't prepare that recording. Try again."
              }
            />
          )}

          {reviewingState !== null && !reviewingState.audible && (
            <InlineError
              testId="turn-sound-silence"
              message="We couldn't hear that. Try recording again."
            />
          )}

          {reviewingState !== null && (
            <div data-testid="turn-sound-review" style={actionsStyle}>
              <span style={subStyle}>
                {reviewingState.playing
                  ? "Playing your take"
                  : "Listen back before you confirm"}
              </span>
              <PillButton
                data-testid="turn-sound-replay"
                size="md"
                tone="outline"
                onClick={() => {
                  machine?.replay();
                }}
              >
                Replay
              </PillButton>
              <PillButton
                data-testid="turn-sound-rerecord"
                size="md"
                tone="outline"
                onClick={() => {
                  machine?.rerecord();
                }}
              >
                Record again
              </PillButton>
              <PillButton
                data-testid="turn-sound-confirm"
                size="lg"
                disabled={!reviewingState.audible}
                onClick={() => {
                  machine?.confirm();
                }}
              >
                Use this sound
              </PillButton>
            </div>
          )}
        </>
      )}

      <PillButton
        data-testid="turn-sound-skip"
        tone="outline"
        size="md"
        onClick={skip}
        style={{ marginTop: "auto" }}
      >
        Skip — use the standard sound
      </PillButton>
    </section>
  );
}
