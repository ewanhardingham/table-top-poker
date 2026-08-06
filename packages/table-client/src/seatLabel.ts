import type { SeatView } from "@table-top-poker/protocol";

/**
 * A seat's human label: its claimed display name, or a 1-based "Seat N"
 * fallback for open or unnamed seats. The one place the table client turns a
 * `seatId` into text, shared by the board, the house-rules sheet, and the
 * showdown overlay so they never drift.
 */
export function seatLabel(seatId: number, seats: readonly SeatView[]): string {
  return (
    seats.find((seat) => seat.id === seatId)?.displayName ??
    `Seat ${String(seatId + 1)}`
  );
}
