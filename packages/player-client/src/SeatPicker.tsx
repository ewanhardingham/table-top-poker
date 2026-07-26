import type { SeatView } from "@table-top-poker/protocol";

export interface SeatPickerProps {
  readonly seats: readonly SeatView[];
  readonly error: string | null;
  readonly onClaim: (seatId: number) => void;
}

export function SeatPicker({ seats, error, onClaim }: SeatPickerProps) {
  return (
    <div data-testid="seat-picker">
      <ul>
        {seats.map((seat) => (
          <li key={seat.id} data-testid={`seat-option-${String(seat.id)}`}>
            Seat {seat.id + 1}
            {seat.claimed ? (
              " — taken"
            ) : (
              <button
                type="button"
                data-testid={`claim-seat-${String(seat.id)}`}
                onClick={() => {
                  onClaim(seat.id);
                }}
              >
                Sit here
              </button>
            )}
          </li>
        ))}
      </ul>
      {error && <div data-testid="claim-error">{error}</div>}
    </div>
  );
}
