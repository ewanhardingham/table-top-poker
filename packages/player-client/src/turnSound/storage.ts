import type { RecordedTurnSoundTake, TurnSoundPlayback } from "./model.js";

const KEY_PREFIX = "ttp:turn-sound:";

export type StoredTurnSoundChoice =
  | { readonly type: "skipped" }
  | { readonly type: "permission-denied" }
  | { readonly type: "recorded"; readonly playback: TurnSoundPlayback };

function key(roomCode: string): string {
  return `${KEY_PREFIX}${roomCode}`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let start = 0; start < bytes.length; start += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000));
  }
  return btoa(binary);
}

function base64ToBytes(encoded: string): Uint8Array<ArrayBuffer> {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

export function saveTurnSoundChoice(
  storage: Storage,
  roomCode: string,
  choice: { readonly type: "skipped" | "permission-denied" },
): void {
  storage.setItem(key(roomCode), JSON.stringify(choice));
}

export async function saveRecordedTurnSound(
  storage: Storage,
  roomCode: string,
  take: RecordedTurnSoundTake,
  values: Omit<TurnSoundPlayback, "buffer">,
  shouldSave: () => boolean = () => true,
): Promise<void> {
  const audio = bytesToBase64(new Uint8Array(await take.audio.arrayBuffer()));
  if (!shouldSave()) return;
  storage.setItem(
    key(roomCode),
    JSON.stringify({
      type: "recorded",
      mimeType: take.audio.type,
      audio,
      ...values,
    }),
  );
}

export async function loadTurnSoundChoice(
  storage: Storage,
  roomCode: string,
  decode: (bytes: ArrayBuffer) => Promise<AudioBuffer>,
): Promise<StoredTurnSoundChoice | null> {
  const raw = storage.getItem(key(roomCode));
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || !("type" in value))
      return null;
    const record = value as Record<string, unknown>;
    if (record.type === "skipped") return { type: "skipped" };
    if (record.type === "permission-denied")
      return { type: "permission-denied" };
    if (
      record.type !== "recorded" ||
      typeof record.audio !== "string" ||
      typeof record.gain !== "number" ||
      typeof record.offset !== "number" ||
      typeof record.duration !== "number"
    )
      return null;
    const bytes = base64ToBytes(record.audio);
    return {
      type: "recorded",
      playback: {
        buffer: await decode(bytes.buffer),
        gain: record.gain,
        offset: record.offset,
        duration: record.duration,
      },
    };
  } catch {
    return null;
  }
}

export function clearTurnSoundChoice(storage: Storage, roomCode: string): void {
  storage.removeItem(key(roomCode));
}
