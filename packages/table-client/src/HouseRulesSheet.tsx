import {
  MAX_SEAT_COUNT,
  MIN_SEAT_COUNT,
  type SeatView,
  type SeatMove,
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

export interface HouseRulesSheetProps {
  readonly seatCount: number;
  readonly pendingSeatCount: number | null;
  readonly seats: readonly SeatView[];
  readonly handInProgress: boolean;
  readonly onApply: (seatCount: number) => void;
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

function seatLabel(seatId: number, seats: readonly SeatView[]): string {
  return (
    seats.find((seat) => seat.id === seatId)?.displayName ??
    `Seat ${String(seatId + 1)}`
  );
}

/** The table-device House rules sheet; seat count is its first setting. */
export function HouseRulesSheet({
  seatCount,
  pendingSeatCount,
  seats,
  handInProgress,
  onApply,
  onClose,
}: HouseRulesSheetProps) {
  const [draft, setDraft] = useState(pendingSeatCount ?? seatCount);
  const seated = claimedSeats(seats).length;
  const floor = Math.max(MIN_SEAT_COUNT, seated);
  const atFloor = draft <= floor;
  const moves = previewMoves(seats, draft);
  const shrinkIsQueued = handInProgress && draft < seatCount;

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
                disabled={atFloor}
                onClick={() => {
                  setDraft((count) => Math.max(floor, count - 1));
                }}
                style={{
                  ...stepperButtonStyle,
                  opacity: atFloor ? 0.32 : 1,
                  cursor: atFloor ? "not-allowed" : "pointer",
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
                disabled={draft >= MAX_SEAT_COUNT}
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
            style={{
              paddingTop: 20,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <span
              style={{
                ...kickerStyle,
                fontSize: "10.5px",
                color: color.textFaint,
              }}
            >
              {shrinkIsQueued
                ? "Applies from the next hand"
                : "Applies immediately"}
            </span>
            <PillButton
              data-testid="settings-done"
              onClick={() => {
                onApply(draft);
              }}
            >
              Done
            </PillButton>
          </div>
        </div>
      </Panel>
    </div>
  );
}
