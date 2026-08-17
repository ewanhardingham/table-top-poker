import { MAX_SEAT_COUNT, MIN_SEAT_COUNT } from "@table-top-poker/protocol";
import {
  Panel,
  PillButton,
  color,
  font,
  fontSize,
  radius,
} from "@table-top-poker/ui-shared";
import type { CSSProperties } from "react";

export interface SeatCountPickerProps {
  readonly seatCount: number;
  readonly onSeatCountChange: (seatCount: number) => void;
  readonly onCreateRoom: () => void;
}

const seatCounts = Array.from(
  { length: MAX_SEAT_COUNT - MIN_SEAT_COUNT + 1 },
  (_, i) => MIN_SEAT_COUNT + i,
);

const panelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 22,
  padding: "34px 40px",
};

const kickerStyle: CSSProperties = {
  fontFamily: font.mono,
  fontSize: fontSize.sm,
  letterSpacing: "0.24em",
  textTransform: "uppercase",
  color: color.textMuted,
};

function chipStyle(selected: boolean): CSSProperties {
  return {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    fontFamily: font.display,
    fontSize: fontSize.lg,
    fontWeight: 700,
    cursor: "pointer",
    transition: "transform .12s ease, box-shadow .12s ease",
    ...(selected
      ? {
          border: `1px solid ${color.seatWinnerBorder}`,
          background: color.pillGradient,
          color: color.pillInk,
          transform: "translateY(-3px)",
          boxShadow: "0 14px 30px -12px rgba(229,68,60,.75)",
        }
      : {
          border: `1px solid ${color.border}`,
          background: color.controlFill,
          color: color.textMuted,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,.06)",
        }),
  };
}

function describeTable(seatCount: number): string {
  return seatCount === MIN_SEAT_COUNT
    ? "Heads-up — two seats"
    : `${String(seatCount)} seats`;
}

export function SeatCountPicker({
  seatCount,
  onSeatCountChange,
  onCreateRoom,
}: SeatCountPickerProps) {
  return (
    <Panel style={panelStyle} data-testid="seat-count-picker">
      <span style={kickerStyle}>How many seats?</span>
      <div style={{ display: "flex", gap: 12 }}>
        {seatCounts.map((count) => (
          <button
            key={count}
            type="button"
            data-testid={`seat-count-${String(count)}-button`}
            aria-pressed={count === seatCount}
            onClick={() => {
              onSeatCountChange(count);
            }}
            style={chipStyle(count === seatCount)}
          >
            {count}
          </button>
        ))}
      </div>
      <span
        data-testid="seat-count-hint"
        style={{ fontSize: fontSize.md, color: color.textDim }}
      >
        {describeTable(seatCount)}
      </span>
      <PillButton
        size="lg"
        data-testid="create-room-button"
        onClick={onCreateRoom}
      >
        Create room
      </PillButton>
    </Panel>
  );
}
