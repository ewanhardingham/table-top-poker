import { color } from "@table-top-poker/ui-shared";
import type { SittingOutReason } from "@table-top-poker/protocol";
import { playerTopPillStyle } from "./topPillStyle.js";

export interface SeatPanelProps {
  readonly seatId: number;
  readonly displayName?: string | null;
  readonly sittingOut: boolean;
  readonly sittingOutReason?: SittingOutReason | null;
}

/*
 * Non-breaking spaces: the separator opens a flex item, and a flex item's
 * leading whitespace is trimmed away, which closed the gap to the name.
 */
const NAME_SEPARATOR = " · ";

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
        // Shrinkable, so that whatever cannot fit gives way here rather than
        // pushing the menu out of the bar (ADR-0006).
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
          /*
           * No `min-width: 0` here on purpose. The pill's automatic minimum is
           * the width its unshrinkable content needs — the seat number — so it
           * stops there instead of collapsing and painting `Seat 6` outside its
           * own border. Only the name inside it may shrink.
           */
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
        {/* The seat number never truncates. It is how a player identifies
         * themselves against the table screen, whereas their own name is the
         * one thing on this bar they already know. */}
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
