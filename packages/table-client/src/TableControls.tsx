import { PillButton, color } from "@table-top-poker/ui-shared";

export interface TableControlsProps {
  readonly canStartHand: boolean;
  readonly handComplete: boolean;
  readonly onStartHand: () => void;
  readonly onNextHand: () => void;
  readonly onEndSession: () => void;
  /**
   * PROTOTYPE (wayfinder #81) — opens the session hand picker. Optional so
   * the live `App` is unaffected; Phase 2 makes it a peer of the other rail
   * actions. Review is reachable exactly when this rail offers a Deal/Next
   * hand button, i.e. between hands (map #79).
   */
  readonly onReviewHands?: () => void;
}

/**
 * The right-hand control rail — every table action the device offers, as one
 * group. Deal hand / Next hand are mutually exclusive with the felt's hand
 * state; Review hands and End session are always available once a room exists
 * (this component is only mounted then).
 *
 * The rail is a fixed-width column and every button fills it, so the actions
 * share one left and right edge instead of ragging off the right margin at
 * whatever width each label happens to be. Sizing comes from `PillButton`'s
 * size token for all of them — an ad-hoc smaller `End session` made the rail
 * read as two unrelated controls rather than one group.
 */
export function TableControls({
  canStartHand,
  handComplete,
  onStartHand,
  onNextHand,
  onEndSession,
  onReviewHands,
}: TableControlsProps) {
  return (
    <div
      style={{
        position: "absolute",
        right: "1.5em",
        top: "50%",
        transform: "translateY(-50%)",
        display: "flex",
        flexDirection: "column",
        width: "13em",
        gap: "0.6em",
      }}
    >
      {canStartHand && (
        <PillButton
          data-testid="start-hand-button"
          onClick={onStartHand}
          style={{ width: "100%" }}
        >
          Deal hand
        </PillButton>
      )}
      {handComplete && (
        <PillButton
          data-testid="next-hand-button"
          onClick={onNextHand}
          style={{ width: "100%" }}
        >
          Next hand
        </PillButton>
      )}
      {onReviewHands && (
        <PillButton
          tone="outline"
          data-testid="review-hands-button"
          onClick={onReviewHands}
          style={{ width: "100%" }}
        >
          Review hands
        </PillButton>
      )}
      <PillButton
        tone="outline"
        data-testid="end-session-button"
        onClick={onEndSession}
        style={{
          width: "100%",
          borderColor: color.accentBorder,
          color: color.textBright,
        }}
      >
        End session
      </PillButton>
    </div>
  );
}
