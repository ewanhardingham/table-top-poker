import { PillButton, color } from "@table-top-poker/ui-shared";
import type { CSSProperties } from "react";

export interface TableControlsProps {
  readonly canStartHand: boolean;
  readonly handComplete: boolean;
  readonly onStartHand: () => void;
  readonly onNextHand: () => void;
  readonly onEndSession: () => void;
  readonly placement?: "rail" | "join-panel";
  /**
   * PROTOTYPE (wayfinder #81) — opens the session hand picker. Optional so
   * the live `App` is unaffected; Phase 2 makes it a peer of the other rail
   * actions. Review is reachable exactly when this rail offers a Deal/Next
   * hand button, i.e. between hands (map #79).
   */
  readonly onReviewHands?: () => void;
}

/**
 * The table action group — a right-hand control rail during a hand, or a
 * group below the join panel while the room is waiting to start. Deal hand /
 * Next hand are mutually exclusive with the felt's hand state; Review hands
 * and End session are always available once a room exists (this component is
 * only mounted then).
 *
 * The rail is a fixed-width column and every button fills it, so the actions
 * share one left and right edge instead of ragging off the right margin at
 * whatever width each label happens to be. Sizing comes from `PillButton`'s
 * size token for all of them — an ad-hoc smaller `End session` made the rail
 * read as two unrelated controls rather than one group.
 *
 * The two secondary actions take the plain outline tone with no per-call
 * colour of their own, so the rail's only visual hierarchy is solid (deal the
 * next hand) against outline (everything else).
 */
export function TableControls({
  canStartHand,
  handComplete,
  onStartHand,
  onNextHand,
  onEndSession,
  placement = "rail",
  onReviewHands,
}: TableControlsProps) {
  const layoutStyle: CSSProperties =
    placement === "join-panel"
      ? {
          position: "relative",
          zIndex: 15,
          display: "flex",
          flexDirection: "row",
          width: "26em",
          maxWidth: "calc(100vw - 2em)",
          gap: "0.6em",
          pointerEvents: "auto",
        }
      : {
          position: "absolute",
          right: "1.5em",
          top: "50%",
          transform: "translateY(-50%)",
          display: "flex",
          flexDirection: "column",
          width: "13em",
          gap: "0.6em",
        };
  const actionButtonStyle: CSSProperties =
    placement === "join-panel"
      ? { flex: "1 1 0", minWidth: 0 }
      : { width: "100%" };
  const disabledStartStyle: CSSProperties =
    placement === "join-panel" && !canStartHand
      ? {
          background: color.controlFill,
          color: color.disabledText,
          border: `1px solid ${color.border}`,
          boxShadow: "none",
          cursor: "default",
        }
      : {};

  return (
    <div data-placement={placement} style={layoutStyle}>
      {(placement === "join-panel" || canStartHand) && (
        <PillButton
          data-testid="start-hand-button"
          disabled={placement === "join-panel" && !canStartHand}
          onClick={onStartHand}
          style={{ ...actionButtonStyle, ...disabledStartStyle }}
        >
          Deal hand
        </PillButton>
      )}
      {handComplete && (
        <PillButton
          data-testid="next-hand-button"
          onClick={onNextHand}
          style={actionButtonStyle}
        >
          Next hand
        </PillButton>
      )}
      {onReviewHands && (
        <PillButton
          tone="outline"
          data-testid="review-hands-button"
          onClick={onReviewHands}
          style={actionButtonStyle}
        >
          Review hands
        </PillButton>
      )}
      <PillButton
        tone="outline"
        data-testid="end-session-button"
        onClick={onEndSession}
        style={actionButtonStyle}
      >
        End session
      </PillButton>
    </div>
  );
}
