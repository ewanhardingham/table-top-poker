export interface CreatedRoom {
  readonly code: string;
  readonly joinUrl: string;
  readonly qrCodeDataUrl: string;
}

export async function createRoom(): Promise<CreatedRoom> {
  const response = await fetch("/rooms", { method: "POST" });
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
