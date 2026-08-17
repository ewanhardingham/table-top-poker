const KEY = "ttp:hosted-room";

export interface HostedRoom {
  readonly code: string;
  readonly joinUrl: string;
  readonly qrCodeDataUrl: string;
}

export function saveHostedRoom(storage: Storage, room: HostedRoom): void {
  storage.setItem(KEY, JSON.stringify(room));
}

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
