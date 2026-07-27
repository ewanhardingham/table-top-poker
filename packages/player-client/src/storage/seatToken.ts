const KEY = "ttp:seat-token";

export interface StoredSeatToken {
  readonly roomCode: string;
  readonly seatId: number;
  readonly token: string;
}

/**
 * Persists a claimed seat's token for reconnect (ticket 33 reads it back).
 * Takes an injected `Storage` so callers can pass `window.localStorage` or a
 * test double without reaching for a global.
 */
export function saveSeatToken(
  storage: Storage,
  seatToken: StoredSeatToken,
): void {
  storage.setItem(KEY, JSON.stringify(seatToken));
}

/**
 * Reads back a stored seat token for auto-reconnect on mount. Malformed or
 * absent storage both read as "nothing to reclaim" — a cleared/corrupted
 * localStorage must never fall back to any other seat (docs/phase-1-spec.md §7).
 */
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
      "token" in parsed &&
      typeof parsed.roomCode === "string" &&
      typeof parsed.seatId === "number" &&
      typeof parsed.token === "string"
    ) {
      return {
        roomCode: parsed.roomCode,
        seatId: parsed.seatId,
        token: parsed.token,
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
