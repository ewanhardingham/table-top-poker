const KEY = "ttp:hosted-room";

export interface HostedRoom {
  readonly code: string;
  readonly joinUrl: string;
  readonly qrCodeDataUrl: string;
}

/**
 * Persists the room this table is hosting so a refresh can re-attach to it
 * instead of dropping back to the create-room screen (#175). The QR/join URL
 * are server-derived at creation and absent from `room-view`, so they ride
 * along here to keep the lobby intact across a reload. Takes an injected
 * `Storage` so callers pass `window.localStorage` or a test double without
 * reaching for a global.
 */
export function saveHostedRoom(storage: Storage, room: HostedRoom): void {
  storage.setItem(KEY, JSON.stringify(room));
}

/**
 * Reads back a stored hosted room for auto-rejoin on mount. Malformed or
 * absent storage both read as "nothing to rejoin" — the client then falls
 * through to the create-room screen.
 */
export function loadHostedRoom(storage: Storage): HostedRoom | null {
  const raw = storage.getItem(KEY);
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "code" in parsed &&
      "joinUrl" in parsed &&
      "qrCodeDataUrl" in parsed
    ) {
      const record = parsed as Record<string, unknown>;
      if (
        typeof record.code !== "string" ||
        typeof record.joinUrl !== "string" ||
        typeof record.qrCodeDataUrl !== "string"
      ) {
        return null;
      }
      return {
        code: record.code,
        joinUrl: record.joinUrl,
        qrCodeDataUrl: record.qrCodeDataUrl,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearHostedRoom(storage: Storage): void {
  storage.removeItem(KEY);
}
