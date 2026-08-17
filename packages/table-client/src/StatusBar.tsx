import { color, font, fontSize, radius } from "@table-top-poker/ui-shared";
import type { CSSProperties } from "react";
import { JoinCodeToggle } from "./JoinCodeToggle.js";
import type { ConnectionStatus } from "./store/connectionSlice.js";

export interface StatusBarProps {
  readonly roomCode: string | null;
  readonly connectionStatus: ConnectionStatus;
  readonly showRoomCode: boolean;
  readonly onOpenJoin: () => void;
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
  flexShrink: 100,
  overflow: "hidden",
};

export function StatusBar({
  roomCode,
  connectionStatus,
  showRoomCode,
  onOpenJoin,
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
        padding: "16px 22px",
      }}
    >
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
