const KEY = "ttp:seat-token";

export interface StoredSeatToken {
  readonly roomCode: string;
  readonly seatId: number;
  readonly token: string;
  readonly displayName?: string;
}

export function saveSeatToken(
  storage: Storage,
  seatToken: StoredSeatToken,
): void {
  storage.setItem(KEY, JSON.stringify(seatToken));
}

export function loadSeatToken(storage: Storage): StoredSeatToken | null {
  const raw = storage.getItem(KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "roomCode" in parsed &&
      "seatId" in parsed &&
      "token" in parsed
    ) {
      const record = parsed as Record<string, unknown>;
      if (
        typeof record.roomCode !== "string" ||
        typeof record.seatId !== "number" ||
        typeof record.token !== "string"
      ) {
        return null;
      }
      return {
        roomCode: record.roomCode,
        seatId: record.seatId,
        token: record.token,
        ...(typeof record.displayName === "string"
          ? { displayName: record.displayName }
          : {}),
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearSeatToken(storage: Storage): void {
  storage.removeItem(KEY);
}
