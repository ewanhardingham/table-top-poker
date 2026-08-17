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

export type LoggedCommand = Command & { readonly v: number };

export type LoggedEvent = (HandEvent | Rejection) & { readonly v: number };

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

export function handLogPaths(gameDir: string, handIndex: number): HandLogPaths {
  const base = handBase(handIndex);
  return {
    commandsPath: path.join(gameDir, `${base}.commands.jsonl`),
    eventsPath: path.join(gameDir, `${base}.events.jsonl`),
  };
}

export class HandLog {
  readonly gameDir: string;
  #handIndex = 0;
  #paths: HandLogPaths | null = null;

  constructor(logDir: string, gameId: string, seats: readonly SeatId[]) {
    assertValidGameId(gameId);
    this.gameDir = path.join(logDir, gameId);
    mkdirSync(this.gameDir, { recursive: true });

    const manifestPath = path.join(this.gameDir, "game.jsonl");
    if (!existsSync(manifestPath)) {
      const manifest: GameManifest = { v: ENGINE_LOG_VERSION, seats };
      appendFileSync(manifestPath, JSON.stringify(manifest) + "\n");
    }
  }

  logCommand(
    command: Command,
    startsHand = command.type === "startHand" || command.type === "nextHand",
  ): void {
    if (startsHand) {
      this.#handIndex += 1;
      this.#paths = handLogPaths(this.gameDir, this.#handIndex);
    }
    if (this.#paths === null) return;

    const record: LoggedCommand = { ...command, v: ENGINE_LOG_VERSION };
    appendFileSync(this.#paths.commandsPath, JSON.stringify(record) + "\n");
  }

  logEvent(event: HandEvent | Rejection): void {
    if (this.#paths === null) return;

    const record: LoggedEvent = { ...event, v: ENGINE_LOG_VERSION };
    appendFileSync(this.#paths.eventsPath, JSON.stringify(record) + "\n");
  }
}
