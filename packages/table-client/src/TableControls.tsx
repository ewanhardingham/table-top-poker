import { PillButton, color, font } from "@table-top-poker/ui-shared";

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
      <button
        type="button"
        data-testid="end-session-button"
        onClick={onEndSession}
        style={{
          padding: "0.9em 1.3em",
          borderRadius: "999px",
          border: `1px solid ${color.border}`,
          background: "rgba(0,0,0,.28)",
          color: color.textMuted,
          fontFamily: font.mono,
          fontSize: "0.7em",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
        }}
      >
        End session
      </button>
    </div>
  );
}
