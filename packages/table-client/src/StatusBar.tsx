import { color, font, fontSize, radius } from "@table-top-poker/ui-shared";
import type { CSSProperties, ReactNode } from "react";
import type { ConnectionStatus } from "./store/connectionSlice.js";

export interface StatusBarProps {
  readonly roomCode: string | null;
  readonly connectionStatus: ConnectionStatus;
  /**
   * Optional content for the bar's left end — what the device is currently
   * showing, when that isn't just "the table". Replay puts the hand being
   * reviewed here (wayfinder #82) rather than floating its own title over
   * the felt, where it competed with the seat pods. Optional so the live
   * `App` is unaffected.
   */
  readonly leading?: ReactNode;
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

/** No connection badge before a room exists — there's nothing to connect to yet. */
export function StatusBar({
  roomCode,
  connectionStatus,
  leading,
}: StatusBarProps) {
  const tone = badgeTone[connectionStatus];
  return (
    <header
      style={{
        flex: "none",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "1em",
        padding: "16px 22px 0",
      }}
    >
      {/* Always present, even when empty, so the badge stays pinned right. */}
      <span>{leading}</span>
      {roomCode !== null && (
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
