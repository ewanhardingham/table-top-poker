import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { ENGINE_LOG_VERSION } from "@table-top-poker/engine";
import type {
  Command,
  HandEvent,
  Rejection,
  SeatId,
} from "@table-top-poker/engine";

const GAME_ID_PATTERN = /^[A-Za-z0-9._-]+$/;

export function assertValidGameId(gameId: string): void {
  if (!GAME_ID_PATTERN.test(gameId)) {
    throw new Error(
      `--game-id: "${gameId}" must match ${GAME_ID_PATTERN.source} (it becomes a directory name)`,
    );
  }
}

export interface VersionedCommand {
  readonly v: number;
  readonly command: Command;
}

export interface VersionedEvent {
  readonly v: number;
  readonly event: HandEvent | Rejection;
}

export interface GameManifest {
  readonly v: number;
  readonly seats: readonly SeatId[];
}

export interface HandLogPaths {
  readonly commandsPath: string;
  readonly eventsPath: string;
}

function handBase(handIndex: number): string {
  return `hand-${String(handIndex).padStart(4, "0")}`;
}

/** `handIndex` 0 is the pre-game bucket for anything received before the first `startHand`/`nextHand`. */
export function handLogPaths(gameDir: string, handIndex: number): HandLogPaths {
  const base = handBase(handIndex);
  return {
    commandsPath: path.join(gameDir, `${base}.commands.jsonl`),
    eventsPath: path.join(gameDir, `${base}.events.jsonl`),
  };
}

/**
 * Append-as-you-go JSONL logger for one game: a seats manifest written once,
 * plus a command/event log file pair per hand, partitioned by game and by
 * hand as required by docs/phase-1-spec.md §5. Every write is a single
 * synchronous fs call — no in-process buffering — so a killed process loses
 * at most the record it was mid-write on, never a batch of completed ones.
 */
export class HandLog {
  readonly gameDir: string;
  #handIndex = 0;
  #paths: HandLogPaths;

  constructor(logDir: string, gameId: string, seats: readonly SeatId[]) {
    assertValidGameId(gameId);
    this.gameDir = path.join(logDir, gameId);
    mkdirSync(this.gameDir, { recursive: true });
    this.#paths = handLogPaths(this.gameDir, this.#handIndex);

    const manifestPath = path.join(this.gameDir, "game.jsonl");
    if (!existsSync(manifestPath)) {
      const manifest: GameManifest = { v: ENGINE_LOG_VERSION, seats };
      appendFileSync(manifestPath, JSON.stringify(manifest) + "\n");
    }
  }

  logCommand(command: Command): void {
    if (command.type === "startHand" || command.type === "nextHand") {
      this.#handIndex += 1;
      this.#paths = handLogPaths(this.gameDir, this.#handIndex);
    }
    const record: VersionedCommand = { v: ENGINE_LOG_VERSION, command };
    appendFileSync(this.#paths.commandsPath, JSON.stringify(record) + "\n");
  }

  logEvent(event: HandEvent | Rejection): void {
    const record: VersionedEvent = { v: ENGINE_LOG_VERSION, event };
    appendFileSync(this.#paths.eventsPath, JSON.stringify(record) + "\n");
  }
}
