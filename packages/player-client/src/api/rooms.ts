import type { RoomView } from "@table-top-poker/protocol";

export async function joinRoom(code: string): Promise<RoomView> {
  const response = await fetch(`/rooms/${code}/join`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`failed to join room: ${String(response.status)}`);
  }
  return (await response.json()) as RoomView;
}

export interface SeatClaim {
  readonly seatId: number;
  readonly token: string;
  readonly sittingOut: boolean;
}

export async function claimSeat(
  code: string,
  seatId: number,
): Promise<SeatClaim> {
  const response = await fetch(`/rooms/${code}/seats/${String(seatId)}/claim`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`failed to claim seat: ${String(response.status)}`);
  }
  return (await response.json()) as SeatClaim;
}
