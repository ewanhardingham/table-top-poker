import path from "node:path";

const ROOM_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

/**
 * The Room ID becomes a directory name, so it must be a safe path segment.
 *
 * The character class alone is not enough: `.` and `..` are built entirely
 * from characters it allows, and `..` resolves *above* the recordings root.
 * The server only ever supplies a UUID, but the harness takes `--room-id`
 * from a developer's argv.
 */
export function assertValidRoomId(roomId: string): void {
  if (!ROOM_ID_PATTERN.test(roomId) || roomId === "." || roomId === "..") {
    throw new Error(
      `room id: "${roomId}" must match ${ROOM_ID_PATTERN.source} and name a directory of its own (it becomes a directory name)`,
    );
  }
}

export const ROOM_MANIFEST_FILENAME = "room.json";

export function roomManifestPath(roomDir: string): string {
  return path.join(roomDir, ROOM_MANIFEST_FILENAME);
}

/** The three files one Hand recording is made of. */
export interface HandRecordingPaths {
  readonly contextPath: string;
  readonly commandsPath: string;
  readonly eventsPath: string;
}

export function handRecordingPaths(
  roomDir: string,
  handOrdinal: number,
): HandRecordingPaths {
  const base = `hand-${String(handOrdinal).padStart(4, "0")}`;
  return {
    contextPath: path.join(roomDir, `${base}.context.json`),
    commandsPath: path.join(roomDir, `${base}.commands.jsonl`),
    eventsPath: path.join(roomDir, `${base}.events.jsonl`),
  };
}
