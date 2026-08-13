import type { SeatId } from "@table-top-poker/engine";
import { assertValidRoomId } from "@table-top-poker/recording";

export function parseSeats(argv: readonly string[]): SeatId[] {
  const flagIndex = argv.indexOf("--seats");
  if (flagIndex === -1) return [0, 1, 2];

  const value = argv[flagIndex + 1];
  if (value === undefined) {
    throw new Error("--seats requires a comma-separated list of seat ids");
  }
  return value.split(",").map((seat) => {
    const trimmed = seat.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`--seats: "${seat}" is not a non-negative integer`);
    }
    return Number.parseInt(trimmed, 10);
  });
}

export interface RecordingOptions {
  readonly recordingsDir: string;
  readonly roomId: string;
}

function defaultRoomId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Recording stays *optional* in the harness: no `--recordings-dir`, no
 * recording. The Room-invariant of Phase 2 spec #129 §3 binds the server,
 * which hosts players who would not otherwise know whether their session is
 * being recorded; it does not bind a developer piping commands through a CLI.
 */
export function parseRecordingOptions(
  argv: readonly string[],
): RecordingOptions | null {
  const dirIndex = argv.indexOf("--recordings-dir");
  if (dirIndex === -1) return null;

  const recordingsDir = argv[dirIndex + 1];
  if (recordingsDir === undefined) {
    throw new Error("--recordings-dir requires a directory path");
  }

  // A harness run has no live Room, so it synthesises one: `--room-id` is the
  // Room ID, still defaulting to a timestamp, and `room.json`'s code is null.
  const roomIdIndex = argv.indexOf("--room-id");
  let roomId: string;
  if (roomIdIndex === -1) {
    roomId = defaultRoomId();
  } else {
    const value = argv[roomIdIndex + 1];
    if (value === undefined) {
      throw new Error("--room-id requires a value");
    }
    roomId = value;
  }

  assertValidRoomId(roomId);
  return { recordingsDir, roomId };
}
