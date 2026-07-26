import type { SeatView } from "@table-top-poker/protocol";

export interface RoomPanelProps {
  readonly roomCode: string;
  readonly joinUrl: string | null;
  readonly qrCodeDataUrl: string | null;
  readonly seats: readonly SeatView[];
  readonly onEndSession: () => void;
}

export function RoomPanel({
  roomCode,
  joinUrl,
  qrCodeDataUrl,
  seats,
  onEndSession,
}: RoomPanelProps) {
  return (
    <div data-testid="room-panel">
      <div data-testid="room-code">{roomCode}</div>
      {qrCodeDataUrl && (
        <img
          data-testid="room-qr"
          src={qrCodeDataUrl}
          alt={`Scan to join at ${joinUrl ?? ""}`}
        />
      )}
      <ul data-testid="seat-list">
        {seats.map((seat) => (
          <li
            key={seat.id}
            data-testid={`seat-${String(seat.id)}`}
            data-claimed={seat.claimed}
            data-sitting-out={seat.sittingOut}
          >
            Seat {seat.id + 1}
            {seat.claimed
              ? seat.sittingOut
                ? " — sitting out"
                : " — claimed"
              : " — open"}
          </li>
        ))}
      </ul>
      <button
        type="button"
        data-testid="end-session-button"
        onClick={onEndSession}
      >
        End session
      </button>
    </div>
  );
}
