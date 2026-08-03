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
};

/**
 * No connection badge before a room exists — there's nothing to connect to yet.
 *
 * The badge is pushed right by its own auto margin rather than by the header's
 * justification, because the room-code pill on the left comes and goes: with
 * `space-between` alone, a lone badge would sit hard left.
 */
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
          style={{ ...badgeStyle, flex: "none", marginLeft: "auto" }}
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
