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
  readonly displayName: string;
  readonly sittingOut: boolean;
}

export async function claimSeat(
  code: string,
  seatId: number,
  displayName: string,
): Promise<SeatClaim> {
  const response = await fetch(`/rooms/${code}/seats/${String(seatId)}/claim`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ displayName }),
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as unknown;
    if (
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
    ) {
      throw new Error(body.error);
    }
    throw new Error(`failed to claim seat: ${String(response.status)}`);
  }
  return (await response.json()) as SeatClaim;
}
