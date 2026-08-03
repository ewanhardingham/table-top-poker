import type { RoomView, SittingOutReason } from "@table-top-poker/protocol";

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
  readonly sittingOutReason: SittingOutReason | null;
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

/**
 * Releases the player's own seat (ADR-0005). Fire-and-forget with `keepalive`
 * so it survives the client's optimistic teardown, and never throws — the
 * client returns to the join screen regardless of whether this lands.
 */
export function leaveSeat(code: string, seatId: number, token: string): void {
  void fetch(`/rooms/${code}/seats/${String(seatId)}/leave`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token }),
    keepalive: true,
  }).catch(() => undefined);
}
