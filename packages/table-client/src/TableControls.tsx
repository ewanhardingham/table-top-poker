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
    pointerEvents: "auto",
  },
};

const actionButtonStyles: Record<TableControlsPlacement, CSSProperties> = {
  rail: { width: "100%" },
  "join-panel": { flex: "1 1 0", minWidth: 0 },
};

const hintStyle: CSSProperties = {
  marginTop: "0.4em",
  textAlign: "center",
  fontSize: fontSize.sm,
  color: color.textDim,
};

export interface TableControlsProps {
  readonly canStartHand: boolean;
  readonly handComplete: boolean;
  readonly canDealNextHand: boolean;
  readonly onStartHand: () => void;
  readonly onNextHand: () => void;
  readonly onEndSession: () => void;
  readonly testMode?: boolean;
  readonly onAddBot?: () => void;
  readonly atShowdown?: boolean;
  readonly onViewShowdown?: () => void;
  readonly placement?: TableControlsPlacement;
  readonly onReviewHands?: () => void;
}

export function TableControls({
  canStartHand,
  handComplete,
  canDealNextHand,
  onStartHand,
  onNextHand,
  onEndSession,
  testMode = false,
  onAddBot,
  atShowdown = false,
  onViewShowdown,
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
      {atShowdown ? (
        <PillButton
          data-testid="view-showdown-button"
          onClick={onViewShowdown}
          style={actionButtonStyle}
        >
          View showdown
        </PillButton>
      ) : (
        handComplete && (
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
        )
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
      {testMode && onAddBot && (
        <PillButton
          tone="outline"
          data-testid="add-bot-button"
          onClick={onAddBot}
          style={actionButtonStyle}
        >
          Add bot
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
