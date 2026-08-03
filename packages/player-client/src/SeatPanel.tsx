import { color } from "@table-top-poker/ui-shared";
import type { SittingOutReason } from "@table-top-poker/protocol";
import { playerTopPillStyle } from "./topPillStyle.js";

export interface SeatPanelProps {
  readonly seatId: number;
  readonly displayName?: string | null;
  readonly sittingOut: boolean;
  readonly sittingOutReason?: SittingOutReason | null;
}

/**
 * The player's identity at the top of the screen: their seat (and name) plus a
 * presence-only sitting-out badge. The seat actions — sit out and leave — live
 * behind the menu (ADR-0005), so this panel carries state, never controls.
 */
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
    </div>
  );
}
