import { color, font, fontSize } from "@table-top-poker/ui-shared";
import type { SittingOutReason } from "@table-top-poker/protocol";
import type { CSSProperties } from "react";
import { PlayerMenu } from "./PlayerMenu.js";
import { SeatPanel } from "./SeatPanel.js";
import { playerTopPillStyle } from "./topPillStyle.js";
import type { ConnectionStatus } from "./store/connectionSlice.js";

export interface StatusBarProps {
  readonly showBadge: boolean;
  readonly connectionStatus: ConnectionStatus;
  readonly hasEverConnected: boolean;
  readonly inLiveHand: boolean;
  readonly onToggleSittingOut: () => void;
  readonly onLeave: () => void;
  readonly turnSoundRecorded: boolean;
  readonly turnSoundDisabled: boolean;
  readonly onEditTurnSound: () => void;
  readonly onRemoveTurnSound: () => void;
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
  flexShrink: 100,
  overflow: "hidden",
  gap: "0.5em",
  background: color.control,
  border: `1px solid ${color.border}`,
};

export function connectionBadgeVisible(
  showBadge: boolean,
  connectionStatus: ConnectionStatus,
  hasEverConnected: boolean,
): boolean {
  return showBadge && hasEverConnected && connectionStatus !== "connected";
}

export function StatusBar({
  showBadge,
  connectionStatus,
  hasEverConnected,
  inLiveHand,
  onToggleSittingOut,
  onLeave,
  turnSoundRecorded,
  turnSoundDisabled,
  onEditTurnSound,
  onRemoveTurnSound,
  seat,
}: StatusBarProps) {
  const tone = badgeTone[connectionStatus];
  const badgeVisible = connectionBadgeVisible(
    showBadge,
    connectionStatus,
    hasEverConnected,
  );
  return (
    <header
      className="player-status-bar"
      data-testid="player-status-bar"
      style={{
        flex: "none",
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        alignItems: "center",
        gap: "0.6em",
        padding: "16px 18px 0",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          minWidth: 0,
          gap: "0.6em",
        }}
      >
        {seat && (
          <SeatPanel
            seatId={seat.seatId}
            displayName={seat.displayName ?? null}
            sittingOut={seat.sittingOut}
            sittingOutReason={seat.sittingOutReason}
          />
        )}
        {badgeVisible && (
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
              className="connection-status-label"
              style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                fontFamily: font.mono,
                fontSize: fontSize.xs,
                fontWeight: 600,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: tone.text,
              }}
            >
              {connectionStatus}
            </span>
          </span>
        )}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-end",
        }}
      >
        {seat && (
          <PlayerMenu
            sittingOut={seat.sittingOut}
            sitOutDisabled={connectionStatus !== "connected"}
            inLiveHand={inLiveHand}
            onToggleSittingOut={onToggleSittingOut}
            onLeave={onLeave}
            turnSoundRecorded={turnSoundRecorded}
            turnSoundDisabled={turnSoundDisabled}
            onEditTurnSound={onEditTurnSound}
            onRemoveTurnSound={onRemoveTurnSound}
          />
        )}
      </div>
    </header>
  );
}
