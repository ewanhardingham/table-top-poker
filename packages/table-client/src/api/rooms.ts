export interface CreatedRoom {
  readonly code: string;
  readonly joinUrl: string;
  readonly qrCodeDataUrl: string;
}

/** `seatCount` is the table size the creator picked — 2-8, re-validated server-side. */
export async function createRoom(seatCount: number): Promise<CreatedRoom> {
  const response = await fetch("/rooms", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seatCount }),
  });
  if (!response.ok) {
    throw new Error(`failed to create room: ${String(response.status)}`);
  }
  return (await response.json()) as CreatedRoom;
}

export async function endSession(code: string): Promise<void> {
  const response = await fetch(`/rooms/${code}/end`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`failed to end session: ${String(response.status)}`);
  }
}

/** The table device's manual evict action (ADR-0003) — no automatic trigger. */
export async function evictSeat(code: string, seatId: number): Promise<void> {
  const response = await fetch(`/rooms/${code}/seats/${String(seatId)}/evict`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`failed to evict seat: ${String(response.status)}`);
  }
}
