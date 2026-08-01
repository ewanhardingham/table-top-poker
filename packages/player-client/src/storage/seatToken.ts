const KEY = "ttp:seat-token";

export interface StoredSeatToken {
  readonly roomCode: string;
  readonly seatId: number;
  readonly token: string;
  /** Added with named claims; absent tokens still reconnect for migration. */
  readonly displayName?: string;
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
