import { color } from "@table-top-poker/ui-shared";
import type { SittingOutReason } from "@table-top-poker/protocol";
import { playerTopPillStyle } from "./topPillStyle.js";

export interface SeatPanelProps {
  readonly seatId: number;
  readonly displayName?: string | null;
  readonly sittingOut: boolean;
  readonly sittingOutReason?: SittingOutReason | null;
}

const NAME_SEPARATOR = " · ";

export function SeatPanel({
  seatId,
  displayName,
  sittingOut,
  sittingOutReason = null,
}: SeatPanelProps) {
  return (
    <div
      data-testid="seat-panel"
      style={{
        minWidth: 0,
        display: "flex",
        alignItems: "center",
        gap: "0.6em",
      }}
    >
      <div
        data-testid="claimed-seat"
        style={{
          ...playerTopPillStyle,
          overflow: "hidden",
          background: color.control,
          border: `1px solid ${color.border}`,
          color: color.textMuted,
        }}
      >
        {displayName && (
          <span
            data-testid="claimed-seat-name"
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {displayName}
          </span>
        )}
        <span style={{ flex: "none" }}>
          {displayName ? NAME_SEPARATOR : ""}Seat {seatId + 1}
        </span>
      </div>
      {sittingOut && (
        <div
          data-testid="sitting-out-badge"
          style={{
            ...playerTopPillStyle,
            flex: "none",
            background: "rgba(255,255,255,.04)",
            border: `1px solid ${color.border}`,
            color: color.textFaint,
          }}
        >
          {sittingOutReason === "waiting-for-next-hand"
            ? "Waiting"
            : "Sitting out"}
        </div>
      )}
    </div>
  );
}
