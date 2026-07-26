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
