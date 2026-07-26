import { mkdtempSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ENGINE_LOG_VERSION } from "@table-top-poker/engine";
import type { Command, HandEvent } from "@table-top-poker/engine";
import { HandLog, handLogPaths } from "./persistence.js";

function readLines(filePath: string): unknown[] {
  return readFileSync(filePath, { encoding: "utf8" })
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => JSON.parse(line) as unknown);
}

describe("HandLog", () => {
  const dirs: string[] = [];

  function tempLogDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "handlog-"));
    dirs.push(dir);
    return dir;
  }

  afterEach(async () => {
    const { rm } = await import("node:fs/promises");
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })),
    );
  });

  it("writes a game manifest carrying the seats and version tag, once", () => {
    const logDir = tempLogDir();
    new HandLog(logDir, "game-1", [0, 1, 2]);
    new HandLog(logDir, "game-1", [0, 1, 2]);

    const manifestPath = path.join(logDir, "game-1", "game.jsonl");
    const lines = readLines(manifestPath);
    expect(lines).toEqual([{ v: ENGINE_LOG_VERSION, seats: [0, 1, 2] }]);
  });

  it("partitions commands and events into a fresh file pair each time a hand starts", () => {
    const logDir = tempLogDir();
    const log = new HandLog(logDir, "game-1", [0, 1, 2]);

    const startHand1: Command = { type: "startHand", playerId: 0, seed: "s1" };
    log.logCommand(startHand1);
    const handStarted1: HandEvent = {
      type: "HandStarted",
      seed: "s1",
      button: 0,
    };
    log.logEvent(handStarted1);

    const nextHand: Command = { type: "nextHand", playerId: 1, seed: "s2" };
    log.logCommand(nextHand);
    const handStarted2: HandEvent = {
      type: "HandStarted",
      seed: "s2",
      button: 1,
    };
    log.logEvent(handStarted2);

    const hand1 = handLogPaths(path.join(logDir, "game-1"), 1);
    const hand2 = handLogPaths(path.join(logDir, "game-1"), 2);

    expect(readLines(hand1.commandsPath)).toEqual([
      { v: ENGINE_LOG_VERSION, command: startHand1 },
    ]);
    expect(readLines(hand1.eventsPath)).toEqual([
      { v: ENGINE_LOG_VERSION, event: handStarted1 },
    ]);
    expect(readLines(hand2.commandsPath)).toEqual([
      { v: ENGINE_LOG_VERSION, command: nextHand },
    ]);
    expect(readLines(hand2.eventsPath)).toEqual([
      { v: ENGINE_LOG_VERSION, event: handStarted2 },
    ]);
  });

  it("appends rather than overwriting across multiple commands in the same hand", async () => {
    const logDir = tempLogDir();
    const log = new HandLog(logDir, "game-1", [0, 1, 2]);

    log.logCommand({ type: "startHand", playerId: 0, seed: "s1" });
    log.logCommand({ type: "call", playerId: 1 });
    log.logCommand({ type: "raise", playerId: 2 });

    const hand1 = handLogPaths(path.join(logDir, "game-1"), 1);
    const text = await readFile(hand1.commandsPath, { encoding: "utf8" });
    expect(text.trim().split("\n")).toHaveLength(3);
  });

  it("rejects a game id that isn't a safe path segment", () => {
    const logDir = tempLogDir();
    expect(() => new HandLog(logDir, "../escape", [0, 1])).toThrow(/game-id/);
    expect(() => new HandLog(logDir, "has spaces", [0, 1])).toThrow(/game-id/);
  });
});
