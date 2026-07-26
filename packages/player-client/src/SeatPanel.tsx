export interface SeatPanelProps {
  readonly seatId: number;
  readonly sittingOut: boolean;
}

export function SeatPanel({ seatId, sittingOut }: SeatPanelProps) {
  return (
    <div data-testid="seat-panel">
      <div data-testid="claimed-seat">Seat {seatId + 1}</div>
      {sittingOut && <div data-testid="sitting-out-badge">Sitting out</div>}
    </div>
  );
}
