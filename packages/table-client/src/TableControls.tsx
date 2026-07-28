import { PillButton } from "@table-top-poker/ui-shared";

export interface TableControlsProps {
  readonly canStartHand: boolean;
  readonly handComplete: boolean;
  readonly onStartHand: () => void;
  readonly onNextHand: () => void;
  readonly onEndSession: () => void;
}

/**
 * The bottom-right control rail — Deal hand / Next hand are mutually
 * exclusive with the felt's hand state, End session is always available
 * once a room exists (this component is only mounted then).
 */
export function TableControls({
  canStartHand,
  handComplete,
  onStartHand,
  onNextHand,
  onEndSession,
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
        alignItems: "flex-end",
        gap: "0.75em",
      }}
    >
      {canStartHand && (
        <PillButton data-testid="start-hand-button" onClick={onStartHand}>
          Deal hand
        </PillButton>
      )}
      {handComplete && (
        <PillButton data-testid="next-hand-button" onClick={onNextHand}>
          Next hand
        </PillButton>
      )}
      <PillButton
        tone="outline"
        data-testid="end-session-button"
        onClick={onEndSession}
        style={{ padding: "15px 22px", fontSize: "11px" }}
      >
        End session
      </PillButton>
    </div>
  );
}
