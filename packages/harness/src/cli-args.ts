import type { SeatId } from "@table-top-poker/engine";
import { assertValidGameId } from "./persistence.js";

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

export interface LogOptions {
  readonly logDir: string;
  readonly gameId: string;
}

function defaultGameId(): string {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

export function parseLogOptions(argv: readonly string[]): LogOptions | null {
  const dirIndex = argv.indexOf("--log-dir");
  if (dirIndex === -1) return null;

  const logDir = argv[dirIndex + 1];
  if (logDir === undefined) {
    throw new Error("--log-dir requires a directory path");
  }

  const gameIdIndex = argv.indexOf("--game-id");
  let gameId: string;
  if (gameIdIndex === -1) {
    gameId = defaultGameId();
  } else {
    const value = argv[gameIdIndex + 1];
    if (value === undefined) {
      throw new Error("--game-id requires a value");
    }
    gameId = value;
  }

  assertValidGameId(gameId);
  return { logDir, gameId };
}
