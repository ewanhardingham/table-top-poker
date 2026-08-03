import { PillButton, color } from "@table-top-poker/ui-shared";
import type { SittingOutReason } from "@table-top-poker/protocol";
import type { CSSProperties } from "react";
import { playerTopPillStyle } from "./topPillStyle.js";

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
