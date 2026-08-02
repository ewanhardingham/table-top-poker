import {
  PillButton,
  color,
  font,
  fontSize,
  radius,
} from "@table-top-poker/ui-shared";
import type { SittingOutReason } from "@table-top-poker/protocol";
import type { CSSProperties } from "react";

export const playerTopPillStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  height: 30,
  padding: "0 12px",
  borderRadius: radius.pill,
  fontFamily: font.mono,
  fontSize: fontSize.xs,
  fontWeight: 600,
  letterSpacing: "0.16em",
  textTransform: "uppercase",
};

/**
 * Geometry only while disabled — `PillButton` owns the disabled fill, ink and
 * cursor, and anything passed here would win over it.
 */
function sittingOutToggleStyle(disabled: boolean): CSSProperties {
  if (disabled) return playerTopPillStyle;
  return {
    ...playerTopPillStyle,
    background: color.accentWash,
    border: `1px solid ${color.accentBorder}`,
    color: color.textBright,
    cursor: "pointer",
  };
}

export interface SeatPanelProps {
  readonly seatId: number;
  readonly displayName?: string | null;
  readonly sittingOut: boolean;
  readonly sittingOutReason?: SittingOutReason | null;
  readonly toggleDisabled: boolean;
  readonly onToggleSittingOut: () => void;
}

export function SeatPanel({
  seatId,
  displayName,
  sittingOut,
  sittingOutReason = null,
  toggleDisabled,
  onToggleSittingOut,
}: SeatPanelProps) {
  return (
    <div
      data-testid="seat-panel"
      style={{
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: "0.6em",
      }}
    >
      <div
        data-testid="claimed-seat"
        style={{
          ...playerTopPillStyle,
          gap: "0.5em",
          background: color.control,
          border: `1px solid ${color.border}`,
          color: color.textMuted,
        }}
      >
        {displayName ? `${displayName} · ` : ""}Seat {seatId + 1}
      </div>
      {sittingOut && (
        <div
          data-testid="sitting-out-badge"
          style={{
            ...playerTopPillStyle,
            background: "rgba(255,255,255,.04)",
            border: `1px solid ${color.border}`,
            color: color.textFaint,
          }}
        >
          {sittingOutReason === "waiting-for-next-hand"
            ? "Waiting for next hand"
            : "Sitting out"}
        </div>
      )}
      <PillButton
        size="md"
        tone="outline"
        data-testid="sitting-out-toggle"
        disabled={toggleDisabled}
        onClick={onToggleSittingOut}
        style={sittingOutToggleStyle(toggleDisabled)}
      >
        {sittingOut ? "Sit in" : "Sit out"}
      </PillButton>
    </div>
  );
}
