import {
  PillButton,
  color,
  font,
  fontSize,
  radius,
} from "@table-top-poker/ui-shared";

export interface SeatPanelProps {
  readonly seatId: number;
  readonly sittingOut: boolean;
  readonly toggleDisabled: boolean;
  readonly onToggleSittingOut: () => void;
}

export function SeatPanel({
  seatId,
  sittingOut,
  toggleDisabled,
  onToggleSittingOut,
}: SeatPanelProps) {
  return (
    <div
      data-testid="seat-panel"
      style={{
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: "0.6em",
      }}
    >
      <div
        data-testid="claimed-seat"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5em",
          padding: "0.4em 0.85em",
          borderRadius: radius.pill,
          background: color.control,
          border: `1px solid ${color.border}`,
          fontFamily: font.mono,
          fontSize: fontSize.xs,
          fontWeight: 600,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: color.textMuted,
        }}
      >
        Seat {seatId + 1}
      </div>
      {sittingOut && (
        <div
          data-testid="sitting-out-badge"
          style={{
            padding: "0.4em 0.85em",
            borderRadius: radius.pill,
            background: "rgba(255,255,255,.04)",
            border: `1px solid ${color.border}`,
            fontFamily: font.mono,
            fontSize: fontSize.xs,
            fontWeight: 600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: color.textFaint,
          }}
        >
          Sitting out
        </div>
      )}
      <PillButton
        size="md"
        tone="outline"
        data-testid="sitting-out-toggle"
        disabled={toggleDisabled}
        onClick={onToggleSittingOut}
        style={{ padding: "8px 12px", fontSize: fontSize.xs }}
      >
        {sittingOut ? "Sit in" : "Sit out"}
      </PillButton>
    </div>
  );
}
