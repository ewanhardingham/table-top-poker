import { color, font, fontSize, radius } from "@table-top-poker/ui-shared";
import type { CSSProperties } from "react";
import { SeatPanel } from "./SeatPanel.js";
import type { ConnectionStatus } from "./store/connectionSlice.js";

export interface StatusBarProps {
  readonly showBadge: boolean;
  readonly connectionStatus: ConnectionStatus;
  readonly seat: {
    readonly seatId: number;
    readonly sittingOut: boolean;
  } | null;
}

const badgeTone: Record<
  ConnectionStatus,
  { readonly dot: string; readonly text: string }
> = {
  connected: { dot: color.textDim, text: color.textMuted },
  connecting: { dot: color.accentBright, text: color.textBright },
  disconnected: { dot: color.accent, text: color.textBright },
};

const badgeStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5em",
  padding: "0.45em 0.9em",
  borderRadius: radius.pill,
  background: color.control,
  border: `1px solid ${color.border}`,
};

/** No connection badge before a seat is claimed — there's nothing to connect to yet. */
export function StatusBar({
  showBadge,
  connectionStatus,
  seat,
}: StatusBarProps) {
  const tone = badgeTone[connectionStatus];
  return (
    <header
      style={{
        flex: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: seat ? "space-between" : "flex-end",
        padding: "16px 18px 0",
      }}
    >
      {seat && <SeatPanel seatId={seat.seatId} sittingOut={seat.sittingOut} />}
      {showBadge && (
        <span
          data-testid="connection-status"
          data-status={connectionStatus}
          style={badgeStyle}
        >
          <span
            style={{
              width: "0.5em",
              height: "0.5em",
              borderRadius: "50%",
              flex: "none",
              background: tone.dot,
            }}
          />
          <span
            style={{
              fontFamily: font.mono,
              fontSize: fontSize.xs,
              fontWeight: 600,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: tone.text,
            }}
          >
            {connectionStatus}
          </span>
        </span>
      )}
    </header>
  );
}
