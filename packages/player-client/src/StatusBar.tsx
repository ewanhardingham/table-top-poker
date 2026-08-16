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
  /** Latched on the first successful connect; see `connectionSlice`. */
  readonly hasEverConnected: boolean;
  readonly inLiveHand: boolean;
  readonly onToggleSittingOut: () => void;
  readonly onLeave: () => void;
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
  /*
   * Precedence as a shrink weight rather than a breakpoint (ADR-0006): the
   * connection is the first thing that should give way, so this yields its
   * label ~100× faster than the seat pill beside it yields the player's name.
   * A width threshold cannot do this — it would have to guess how many pills
   * are on the row. Its minimum is its own dot: no `min-width: 0` here, so it
   * stops at the unshrinkable content rather than collapsing.
   */
  flexShrink: 100,
  overflow: "hidden",
  gap: "0.5em",
  background: color.control,
  border: `1px solid ${color.border}`,
};

/**
 * The badge reports trouble, not health (ADR-0006). A permanent `CONNECTED`
 * pill spends width on the one state that needs no reporting, and it is the
 * state a player is in essentially always — so it is shown only while the
 * connection is not good, and only once there has been a connection to lose.
 * Without that second condition the pre-socket `disconnected` default would
 * warn about a drop that has not happened, on every load.
 */
export function connectionBadgeVisible(
  showBadge: boolean,
  connectionStatus: ConnectionStatus,
  hasEverConnected: boolean,
): boolean {
  return showBadge && hasEverConnected && connectionStatus !== "connected";
}

/** No connection badge before a seat is claimed — there's nothing to connect to yet. */
export function StatusBar({
  showBadge,
  connectionStatus,
  hasEverConnected,
  inLiveHand,
  onToggleSittingOut,
  onLeave,
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
        /*
         * Two columns, and the second one is not negotiable: the menu holds
         * sit out and leave, so a top bar that pushes the burger off the edge
         * strands the player (ADR-0006). A flex row cannot promise that —
         * any sibling added with `flex: none` silently reclaims the space —
         * whereas a fixed track is a property of the container that no future
         * pill can take back. `minmax(0, 1fr)` is what lets the left column
         * shrink below its content instead of overflowing.
         */
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) auto",
        alignItems: "center",
        gap: "0.6em",
        padding: "16px 18px 0",
      }}
    >
      {/* Every pill shares the flexible column. The badge belongs here rather
       * than beside the burger: anything in the reserved track competes with
       * the menu for it, and the connection is the *first* thing that should
       * give way, not the last (ADR-0006). */}
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
            {/* First to go when the row is tight — the dot beside it keeps
             * reporting the state in colour, so the label is the cheapest
             * thing on the bar to lose. */}
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
          />
        )}
      </div>
    </header>
  );
}
