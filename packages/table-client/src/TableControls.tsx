import { color, fontSize, PillButton } from "@table-top-poker/ui-shared";
import type { CSSProperties } from "react";

export type TableControlsPlacement = "rail" | "join-panel";

const layoutStyles: Record<TableControlsPlacement, CSSProperties> = {
  rail: {
    position: "absolute",
    right: "1.5em",
    top: "50%",
    transform: "translateY(-50%)",
    display: "flex",
    flexDirection: "column",
    width: "13em",
    gap: "0.6em",
  },
  "join-panel": {
    display: "flex",
    flexDirection: "row",
    width: "26em",
    maxWidth: "calc(100vw - 2em)",
    gap: "0.6em",
    // The join overlay turns pointer events off so its invisible edges don't
    // swallow clicks on the felt; the controls have to turn them back on.
    pointerEvents: "auto",
  },
};

const actionButtonStyles: Record<TableControlsPlacement, CSSProperties> = {
  rail: { width: "100%" },
  "join-panel": { flex: "1 1 0", minWidth: 0 },
};

/**
 * The reason under a disabled "Next hand". A greyed pill says the action is
 * off but not why, and the lobby hint that carries the same message is hidden
 * once a hand exists — so the rail has to say it itself.
 */
const hintStyle: CSSProperties = {
  marginTop: "0.4em",
  textAlign: "center",
  fontSize: fontSize.sm,
  color: color.textDim,
};

export interface TableControlsProps {
  readonly canStartHand: boolean;
  readonly handComplete: boolean;
  /**
   * Whether enough players are dealt in for the server to accept `nextHand`.
   * False leaves the button in place but disabled with a reason, rather than
   * live-looking and inert — the server rejects it either way.
   */
  readonly canDealNextHand: boolean;
  readonly onStartHand: () => void;
  readonly onNextHand: () => void;
  readonly onEndSession: () => void;
  readonly placement?: TableControlsPlacement;
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
  canDealNextHand,
  onStartHand,
  onNextHand,
  onEndSession,
  placement = "rail",
  onReviewHands,
}: TableControlsProps) {
  const layoutStyle = layoutStyles[placement];
  const actionButtonStyle = actionButtonStyles[placement];

  return (
    <div data-placement={placement} style={layoutStyle}>
      {(placement === "join-panel" || canStartHand) && (
        <PillButton
          data-testid="start-hand-button"
          disabled={placement === "join-panel" && !canStartHand}
          onClick={onStartHand}
          style={actionButtonStyle}
        >
          Deal hand
        </PillButton>
      )}
      {handComplete && (
        <div style={actionButtonStyle}>
          <PillButton
            data-testid="next-hand-button"
            disabled={!canDealNextHand}
            onClick={onNextHand}
            style={{ width: "100%" }}
          >
            Next hand
          </PillButton>
          {!canDealNextHand && (
            <div data-testid="next-hand-blocked-hint" style={hintStyle}>
              Waiting for at least two players
            </div>
          )}
        </div>
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
