import { color, font, radius } from "@table-top-poker/ui-shared";
import type { CSSProperties, ReactNode } from "react";
import { JoinCodeToggle } from "./JoinCodeToggle.js";
import type { ConnectionStatus } from "./store/connectionSlice.js";

export interface StatusBarProps {
  readonly roomCode: string | null;
  readonly connectionStatus: ConnectionStatus;
  readonly showRoomCode: boolean;
  readonly onOpenJoin: () => void;
  /** What the device is showing, when that isn't simply the live table. */
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

/** The scale the shell hands its chrome — see `app-shell.css`. */
export const CHROME_UNIT = "var(--chrome-unit)";

const badgeStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "0.5em",
  padding: "0.45em 0.9em",
  borderRadius: radius.pill,
  background: color.control,
  border: `1px solid ${color.border}`,
  flexShrink: 100,
  overflow: "hidden",
};

export function StatusBar({
  roomCode,
  connectionStatus,
  showRoomCode,
  onOpenJoin,
  leading,
}: StatusBarProps) {
  const tone = badgeTone[connectionStatus];
  return (
    <header
      style={{
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: "0.75em",
        width: "100%",
        minWidth: 0,
        fontSize: CHROME_UNIT,
        padding: "1em 1.4em",
      }}
    >
      {leading}
      {roomCode !== null && showRoomCode && (
        <JoinCodeToggle roomCode={roomCode} onOpen={onOpenJoin} />
      )}
      {roomCode !== null && (
        <span
          data-testid="connection-status"
          data-status={connectionStatus}
          style={{ ...badgeStyle, marginLeft: "auto" }}
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
            className="connection-status-label"
            style={{
              minWidth: 0,
              overflow: "hidden",
              textOverflow: "ellipsis",
              fontFamily: font.mono,
              fontSize: "0.62em",
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
