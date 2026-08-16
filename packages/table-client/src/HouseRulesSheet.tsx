import {
  MAX_SEAT_COUNT,
  MAX_SHOT_CLOCK_SECONDS,
  MIN_SEAT_COUNT,
  MIN_SHOT_CLOCK_SECONDS,
  type SeatView,
  type SeatMove,
  type ShotClockSettings,
  type SoundSettings,
} from "@table-top-poker/protocol";
import {
  Panel,
  PillButton,
  color,
  font,
  fontSize,
  radius,
  shadow,
} from "@table-top-poker/ui-shared";
import { useState, type CSSProperties } from "react";
import { seatLabel } from "./seatLabel.js";

export interface HouseRulesSheetProps {
  readonly seatCount: number;
  readonly pendingSeatCount: number | null;
  readonly pendingShotClock: ShotClockSettings | null;
  readonly seats: readonly SeatView[];
  readonly handInProgress: boolean;
  readonly soundSettings: SoundSettings;
  readonly shotClockSettings: ShotClockSettings;
  readonly onApply: (seatCount: number) => void | Promise<void>;
  readonly onApplyShotClock: (
    settings: ShotClockSettings,
  ) => void | Promise<void>;
  readonly onChangeSoundSettings: (next: SoundSettings) => void;
  readonly onClose: () => void;
}

function claimedSeats(seats: readonly SeatView[]): readonly number[] {
  return seats
    .filter((seat) => seat.claimed)
    .map((seat) => seat.id)
    .sort((a, b) => a - b);
}

function previewMoves(
  seats: readonly SeatView[],
  nextSeatCount: number,
): readonly SeatMove[] {
  if (nextSeatCount >= seats.length) return [];
  return claimedSeats(seats)
    .map((from, index) => ({ from, to: index }))
    .filter((move) => move.from !== move.to);
}

const kickerStyle: CSSProperties = {
  fontFamily: font.mono,
  fontSize: fontSize.xs,
  letterSpacing: "0.24em",
  textTransform: "uppercase",
  color: color.textMuted,
};

const stepperButtonStyle: CSSProperties = {
  width: 42,
  height: 42,
  borderRadius: 11,
  border: 0,
  background: color.controlFill,
  fontSize: 22,
  lineHeight: 1,
  color: color.textBright,
  cursor: "pointer",
};

export interface ShotClockSecondsDraft {
  readonly input: string;
  readonly seconds: number;
  readonly valid: boolean;
}

/**
 * Keeps transient keystrokes visible while committing only valid settings.
 * For example, replacing 90 with 45 naturally produces "4" before "45";
 * "4" is retained in the input but does not overwrite the last valid value.
 */
export function updateShotClockSecondsDraft(
  draft: ShotClockSecondsDraft,
  input: string,
): ShotClockSecondsDraft {
  const seconds = Number(input);
  if (
    /^\d+$/.test(input) &&
    Number.isInteger(seconds) &&
    seconds >= MIN_SHOT_CLOCK_SECONDS &&
    seconds <= MAX_SHOT_CLOCK_SECONDS
  ) {
    return { input, seconds, valid: true };
  }
  return { ...draft, input, valid: false };
}

/**
 * A single on/off switch. `nested` renders the smaller, indented variant used
 * by the sub-settings under a master toggle; `disabled` greys it out and blocks
 * interaction (a category toggle while its master is off).
 */
function Toggle({
  label,
  checked,
  disabled = false,
  nested = false,
  testId,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly disabled?: boolean;
  readonly nested?: boolean;
  readonly testId: string;
  readonly onChange: (next: boolean) => void;
}) {
  const width = nested ? 42 : 50;
  const height = nested ? 24 : 28;
  const knob = height - 8;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 20,
        paddingLeft: nested ? 22 : 0,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      <span
        style={{
          fontSize: nested ? fontSize.md : fontSize.lg,
          fontWeight: nested ? 500 : 600,
          color: nested ? color.textDim : color.text,
        }}
      >
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        data-testid={testId}
        disabled={disabled}
        onClick={() => {
          onChange(!checked);
        }}
        style={{
          flex: "none",
          width,
          height,
          borderRadius: height / 2,
          border: 0,
          padding: 0,
          position: "relative",
          background: checked ? color.textBright : color.controlFill,
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "background .15s",
        }}
      >
        <span
          style={{
            position: "absolute",
            top: 4,
            left: checked ? width - knob - 4 : 4,
            width: knob,
            height: knob,
            borderRadius: "50%",
            background: checked ? color.control : color.textBright,
            transition: "left .15s",
          }}
        />
      </button>
    </div>
  );
}

/** The table-device House rules sheet; seat count is its first setting. */
export function HouseRulesSheet({
  seatCount,
  pendingSeatCount,
  pendingShotClock,
  seats,
  handInProgress,
  soundSettings,
  shotClockSettings,
  onApply,
  onApplyShotClock,
  onChangeSoundSettings,
  onClose,
}: HouseRulesSheetProps) {
  const [draft, setDraft] = useState(pendingSeatCount ?? seatCount);
  const seated = claimedSeats(seats).length;
  const floor = Math.max(MIN_SEAT_COUNT, seated);
  const atFloor = draft <= floor;
  const moves = previewMoves(seats, draft);
  const shrinkIsQueued = handInProgress && draft < seatCount;
  const [shotClockDraft, setShotClockDraft] = useState(
    pendingShotClock ?? shotClockSettings,
  );
  const [shotClockSecondsDraft, setShotClockSecondsDraft] = useState(() =>
    updateShotClockSecondsDraft(
      {
        input: "",
        seconds: (pendingShotClock ?? shotClockSettings).seconds,
        valid: true,
      },
      String((pendingShotClock ?? shotClockSettings).seconds),
    ),
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const shotClockChanged =
    shotClockDraft.enabled !==
      (pendingShotClock ?? shotClockSettings).enabled ||
    shotClockDraft.seconds !== (pendingShotClock ?? shotClockSettings).seconds;
  const shotClockIsQueued = pendingShotClock !== null || shotClockChanged;

  async function applyHouseRules(): Promise<void> {
    if (saving || !shotClockSecondsDraft.valid) return;
    setSaving(true);
    setSaveError(null);
    try {
      const writes: Promise<void>[] = [
        Promise.resolve().then(() => onApply(draft)),
      ];
      if (shotClockChanged) {
        writes.push(
          Promise.resolve().then(() => onApplyShotClock(shotClockDraft)),
        );
      }
      const results = await Promise.allSettled(writes);
      if (results.some((result) => result.status === "rejected")) {
        throw new Error("house-rules-save-failed");
      }
      onClose();
    } catch {
      setSaveError("Could not save house rules. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      data-testid="house-rules-sheet"
      role="dialog"
      aria-modal="true"
      aria-labelledby="house-rules-title"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 14,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(6,4,4,.66)",
        backdropFilter: "blur(5px)",
      }}
    >
      <Panel
        style={{
          width: "min(660px, calc(100% - 32px))",
          borderRadius: radius.panel,
          background: color.surfaceGradient,
          boxShadow: shadow.panel,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            padding: "26px 30px 20px",
            display: "flex",
            justifyContent: "space-between",
            gap: 20,
            borderBottom: `1px solid ${color.border}`,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={kickerStyle}>Table settings</span>
            <span
              id="house-rules-title"
              style={{
                fontFamily: font.display,
                fontWeight: 800,
                letterSpacing: "-.03em",
                fontSize: fontSize.display,
                color: color.text,
              }}
            >
              House rules
            </span>
          </div>
          <button
            type="button"
            aria-label="Close table settings"
            data-testid="close-settings-button"
            disabled={saving}
            onClick={onClose}
            style={{
              width: 42,
              height: 42,
              borderRadius: 13,
              border: `1px solid ${color.border}`,
              background: "transparent",
              color: color.textMuted,
              fontSize: 17,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: "6px 30px 24px" }}>
          <div
            style={{
              padding: "19px 0",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 24,
              borderBottom: `1px solid ${color.mutedSurface}`,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span
                style={{
                  fontSize: fontSize.lg,
                  fontWeight: 600,
                  color: color.text,
                }}
              >
                Seats at the table
              </span>
              <span
                style={{
                  fontSize: fontSize.caption,
                  lineHeight: 1.45,
                  color: color.textDim,
                }}
              >
                Between {String(floor)} and {MAX_SEAT_COUNT} seats.
              </span>
            </div>
            <div
              style={{
                flex: "none",
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 6,
                borderRadius: 14,
                background: color.controlFill,
                border: `1px solid ${color.border}`,
              }}
            >
              <button
                type="button"
                data-testid="seat-count-decrement"
                aria-label="Decrease seat count"
                disabled={atFloor || saving}
                onClick={() => {
                  setDraft((count) => Math.max(floor, count - 1));
                }}
                style={{
                  ...stepperButtonStyle,
                  opacity: atFloor || saving ? 0.32 : 1,
                  cursor: atFloor || saving ? "not-allowed" : "pointer",
                }}
              >
                −
              </button>
              <span
                data-testid="seat-count-value"
                style={{
                  minWidth: 56,
                  textAlign: "center",
                  fontFamily: font.display,
                  fontWeight: 800,
                  fontSize: fontSize.xl,
                  color: color.textBright,
                }}
              >
                {draft}
              </span>
              <button
                type="button"
                data-testid="seat-count-increment"
                aria-label="Increase seat count"
                disabled={draft >= MAX_SEAT_COUNT || saving}
                onClick={() => {
                  setDraft((count) => Math.min(MAX_SEAT_COUNT, count + 1));
                }}
                style={stepperButtonStyle}
              >
                +
              </button>
            </div>
          </div>

          <div
            data-testid="seat-count-preview"
            style={{
              minHeight: 54,
              paddingTop: 16,
              fontSize: fontSize.md,
              lineHeight: 1.5,
              color: color.textDim,
            }}
          >
            {atFloor && (
              <div style={{ color: color.textMuted, marginBottom: 6 }}>
                {String(seated)} seated — can&apos;t go lower without evicting
                someone.
              </div>
            )}
            {moves.length > 0 ? (
              <div>
                Players move:{" "}
                <span style={{ color: color.textBright }}>
                  {moves
                    .map(
                      (move) =>
                        // The destination stays labelled: a bare number beside
                        // a name reads as a score, and numeric names ("7→2")
                        // would be unreadable otherwise.
                        `${seatLabel(move.from, seats)} → Seat ${String(move.to + 1)}`,
                    )
                    .join(", ")}
                </span>
              </div>
            ) : null}
          </div>

          <div
            data-testid="sound-settings"
            style={{
              paddingTop: 20,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              borderTop: `1px solid ${color.mutedSurface}`,
              marginTop: 4,
            }}
          >
            <Toggle
              label="Sound"
              checked={soundSettings.sounds}
              disabled={saving}
              testId="sound-master-toggle"
              onChange={(sounds) => {
                onChangeSoundSettings({ ...soundSettings, sounds });
              }}
            />
            <Toggle
              label="Cards"
              nested
              checked={soundSettings.cards}
              disabled={saving || !soundSettings.sounds}
              testId="sound-cards-toggle"
              onChange={(cards) => {
                onChangeSoundSettings({ ...soundSettings, cards });
              }}
            />
            <Toggle
              label="Actions"
              nested
              checked={soundSettings.actions}
              disabled={saving || !soundSettings.sounds}
              testId="sound-actions-toggle"
              onChange={(actions) => {
                onChangeSoundSettings({ ...soundSettings, actions });
              }}
            />
            <Toggle
              label="Notifications"
              nested
              checked={soundSettings.notifications}
              disabled={saving || !soundSettings.sounds}
              testId="sound-notifications-toggle"
              onChange={(notifications) => {
                onChangeSoundSettings({ ...soundSettings, notifications });
              }}
            />
          </div>

          <div
            data-testid="shot-clock-settings"
            style={{
              paddingTop: 20,
              display: "flex",
              flexDirection: "column",
              gap: 16,
              borderTop: `1px solid ${color.mutedSurface}`,
              marginTop: 20,
            }}
          >
            <Toggle
              label="Shot clock"
              checked={shotClockDraft.enabled}
              disabled={saving}
              testId="shot-clock-toggle"
              onChange={(enabled) => {
                setShotClockDraft((current) => ({ ...current, enabled }));
              }}
            />
            <label
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 20,
                paddingLeft: 22,
                color: color.textDim,
                fontSize: fontSize.md,
              }}
            >
              <span>Seconds per turn</span>
              <input
                type="number"
                min={MIN_SHOT_CLOCK_SECONDS}
                max={MAX_SHOT_CLOCK_SECONDS}
                step={1}
                value={shotClockSecondsDraft.input}
                data-testid="shot-clock-seconds"
                aria-label="Shot clock seconds"
                disabled={saving}
                onChange={(event) => {
                  const next = updateShotClockSecondsDraft(
                    shotClockSecondsDraft,
                    event.currentTarget.value,
                  );
                  setShotClockSecondsDraft(next);
                  setShotClockDraft((current) => ({
                    ...current,
                    seconds: next.seconds,
                  }));
                }}
                style={{
                  width: 92,
                  padding: "9px 10px",
                  borderRadius: 10,
                  border: `1px solid ${color.border}`,
                  background: color.controlFill,
                  color: color.textBright,
                  fontFamily: font.mono,
                  fontSize: fontSize.md,
                  textAlign: "right",
                }}
              />
            </label>
            {!shotClockSecondsDraft.valid ? (
              <span
                data-testid="shot-clock-validation"
                role="alert"
                style={{
                  color: color.accentBright,
                  fontSize: fontSize.caption,
                  paddingLeft: 22,
                }}
              >
                Enter a whole number from {String(MIN_SHOT_CLOCK_SECONDS)} to{" "}
                {String(MAX_SHOT_CLOCK_SECONDS)} seconds.
              </span>
            ) : null}
            {shotClockIsQueued ? (
              <span
                style={{
                  ...kickerStyle,
                  fontSize: "10.5px",
                  color: color.textFaint,
                  paddingLeft: 22,
                }}
              >
                Applies from the next hand
              </span>
            ) : null}
          </div>

          <div
            style={{
              paddingTop: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            {saveError !== null ? (
              <span
                role="alert"
                style={{
                  color: color.accentBright,
                  fontSize: fontSize.caption,
                }}
              >
                {saveError}
              </span>
            ) : null}
            <span
              style={{
                ...kickerStyle,
                fontSize: "10.5px",
                color: color.textFaint,
              }}
            >
              {shrinkIsQueued
                ? "Applies from the next hand"
                : "Seat count: Applies immediately"}
            </span>
            <PillButton
              data-testid="settings-done"
              aria-busy={saving}
              disabled={saving || !shotClockSecondsDraft.valid}
              onClick={() => {
                void applyHouseRules();
              }}
            >
              {saving ? "Saving…" : "Done"}
            </PillButton>
          </div>
        </div>
      </Panel>
    </div>
  );
}
