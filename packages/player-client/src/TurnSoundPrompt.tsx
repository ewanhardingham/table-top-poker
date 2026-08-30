import {
  PillButton,
  color,
  font,
  fontSize,
  radius,
  shadow,
} from "@table-top-poker/ui-shared";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
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
  alignItems: "center",
  gap: 18,
  padding: "30px 20px 26px",
  textAlign: "center",
};

const kickerStyle: CSSProperties = {
  color: color.accentBright,
  fontFamily: font.mono,
  fontSize: fontSize.xs,
  fontWeight: 700,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

const headingStyle: CSSProperties = {
  margin: 0,
  color: color.textBright,
  fontFamily: font.display,
  fontSize: fontSize.xl,
  lineHeight: 1.1,
};

const descriptionStyle: CSSProperties = {
  maxWidth: 350,
  margin: 0,
  color: color.textMuted,
  fontSize: fontSize.md,
  lineHeight: 1.5,
};

const stageStyle: CSSProperties = {
  width: "100%",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 12,
  marginTop: 8,
};

const meterStyle: CSSProperties = {
  width: "100%",
  maxWidth: 310,
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

const captionStyle: CSSProperties = {
  color: color.textDim,
  fontFamily: font.mono,
  fontSize: fontSize.sm,
  letterSpacing: "0.04em",
};

const hintStyle: CSSProperties = {
  maxWidth: 310,
  padding: "10px 14px",
  border: `1px solid ${color.lossBorder}`,
  borderRadius: radius.control,
  background: color.lossBackground,
  color: color.textBright,
  fontSize: fontSize.caption,
  lineHeight: 1.4,
};

const actionsStyle: CSSProperties = {
  width: "100%",
  maxWidth: 340,
  display: "flex",
  flexDirection: "column",
  gap: 10,
  marginTop: 4,
};

function ringStyle(progress: number): CSSProperties {
  return {
    width: 174,
    height: 174,
    padding: 6,
    borderRadius: "50%",
    background: `conic-gradient(${color.accentBright} ${String(
      progress * 360,
    )}deg, rgba(255,255,255,.1) 0deg)`,
    boxShadow: `0 0 0 1px ${color.border}, 0 20px 50px -24px ${color.accent}`,
  };
}

const recordButtonStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  border: `1px solid ${color.borderStrong}`,
  borderRadius: "50%",
  background: "radial-gradient(circle at 50% 36%, #3b171b, #16090b 72%)",
  color: color.textBright,
  fontFamily: font.display,
  fontSize: fontSize.lg,
  fontWeight: 700,
  lineHeight: 1.1,
  boxShadow: shadow.pill,
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
      <div style={kickerStyle}>Before you join the table</div>
      <h1 style={headingStyle}>Make your turn sound</h1>
      <p style={descriptionStyle}>
        Hold the microphone button while you record. We&apos;ll play it back so
        you can try again or keep it.
      </p>

      {permission === "requesting" ? (
        <div data-testid="turn-sound-permission" style={stageStyle}>
          <div style={captionStyle}>Setting up the microphone…</div>
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
                style={recordButtonStyle}
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
            <div data-testid="turn-sound-progress" style={captionStyle}>
              {recordingState
                ? durationLabel(recordingState.elapsedMs)
                : reviewingState
                  ? durationLabel(reviewingState.durationMs)
                  : "Up to 3.0s"}
            </div>
          </div>

          {state.phase === "idle" && state.hint !== null && (
            <div data-testid="turn-sound-hint" style={hintStyle}>
              {state.hint === "hold-to-record"
                ? "Hold to record a little longer."
                : "We couldn't prepare that recording. Try again."}
            </div>
          )}

          {reviewingState !== null && !reviewingState.audible && (
            <div data-testid="turn-sound-silence" style={hintStyle}>
              We couldn&apos;t hear that. Try recording again.
            </div>
          )}

          {reviewingState !== null && (
            <div data-testid="turn-sound-review" style={actionsStyle}>
              <div style={captionStyle}>
                {reviewingState.playing
                  ? "Playing your take…"
                  : "Listen back before you confirm."}
              </div>
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
                size="md"
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
      >
        Skip — use the standard sound
      </PillButton>
    </section>
  );
}
