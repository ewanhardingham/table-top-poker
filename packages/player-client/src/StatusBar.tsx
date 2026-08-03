import { color, font, fontSize } from "@table-top-poker/ui-shared";
import type { SittingOutReason } from "@table-top-poker/protocol";
import type { CSSProperties } from "react";
import { SeatPanel } from "./SeatPanel.js";
import { playerTopPillStyle } from "./topPillStyle.js";
import type { ConnectionStatus } from "./store/connectionSlice.js";

export interface StatusBarProps {
  readonly showBadge: boolean;
  readonly connectionStatus: ConnectionStatus;
  readonly onToggleSittingOut: () => void;
  readonly seat: {
    readonly seatId: number;
    readonly displayName?: string | null;
    readonly sittingOut: boolean;
    readonly sittingOutReason: SittingOutReason | null;
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
  ...playerTopPillStyle,
  gap: "0.5em",
  background: color.control,
  border: `1px solid ${color.border}`,
};

/** No connection badge before a seat is claimed — there's nothing to connect to yet. */
export function StatusBar({
  showBadge,
  connectionStatus,
  onToggleSittingOut,
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
      {seat && (
        <SeatPanel
          seatId={seat.seatId}
          displayName={seat.displayName ?? null}
          sittingOut={seat.sittingOut}
          sittingOutReason={seat.sittingOutReason}
          toggleDisabled={connectionStatus !== "connected"}
          onToggleSittingOut={onToggleSittingOut}
        />
      )}
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
