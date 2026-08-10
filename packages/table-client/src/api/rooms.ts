import type {
  RoomView,
  SeatCountChange,
  SoundSettings,
} from "@table-top-poker/protocol";

export interface CreatedRoom {
  readonly code: string;
  readonly joinUrl: string;
  readonly qrCodeDataUrl: string;
}

/**
 * Confirms a room is still live before the table re-attaches on refresh
 * (#175). The WebSocket handshake 404s for a dead room, but a browser socket
 * can't tell that rejection from a transient drop, so the reconnect loop would
 * retry forever — this HTTP check decides existence up front, mirroring the
 * player client's reclaim-on-mount. Rejects on a 404 (grace window elapsed) or
 * any non-2xx.
 */
export async function fetchRoom(code: string): Promise<RoomView> {
  const response = await fetch(`/rooms/${code}/join`, { method: "POST" });
  if (!response.ok) {
    throw new Error(`failed to fetch room: ${String(response.status)}`);
  }
  return (await response.json()) as RoomView;
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

/** The table device's House rules setting for the room seat count. */
export async function changeSeatCount(
  code: string,
  seatCount: number,
): Promise<SeatCountChange> {
  const response = await fetch(`/rooms/${code}/seats/count`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ seatCount }),
  });
  if (!response.ok) {
    throw new Error(`failed to change seat count: ${String(response.status)}`);
  }
  return (await response.json()) as SeatCountChange;
}

/** The table device's room-wide tactile-sound settings (#182). */
export async function changeSoundSettings(
  code: string,
  settings: SoundSettings,
): Promise<SoundSettings> {
  const response = await fetch(`/rooms/${code}/sound`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(settings),
  });
  if (!response.ok) {
    throw new Error(
      `failed to change sound settings: ${String(response.status)}`,
    );
  }
  return (await response.json()) as SoundSettings;
}
