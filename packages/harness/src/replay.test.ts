import { createReadStream, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import {
  createInitialState,
  ENGINE_LOG_VERSION,
} from "@table-top-poker/engine";
import type { HandEvent, Rejection } from "@table-top-poker/engine";
import { runHarness } from "./harness.js";
import { handLogPaths, HandLog } from "./persistence.js";

function collectingWritable(): { writable: Writable; lines: () => string[] } {
  const chunks: string[] = [];
  const writable = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString("utf8"));
      callback();
    },
  });
  return { writable, lines: () => chunks.join("").split("\n").slice(0, -1) };
}

function readJsonLines(filePath: string): unknown[] {
  return readFileSync(filePath, { encoding: "utf8" })
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as unknown);
}

function withoutVersion<T extends { v: number }>(record: T): Omit<T, "v"> {
  const { v, ...rest } = record;
  void v;
  return rest;
}

describe("replay guarantee", () => {
  const dirs: string[] = [];

  function tempLogDir(): string {
    const dir = mkdtempSync(path.join(tmpdir(), "replay-"));
    dirs.push(dir);
    return dir;
  }

  afterEach(() => {
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  it("re-piping a persisted command log through the harness reproduces the persisted event log exactly", async () => {
    const logDir = tempLogDir();
    const seats = [0, 1, 2] as const;
    const log = new HandLog(logDir, "game-1", seats);

    const commands = [
      { type: "startHand", playerId: 0, seed: "replay-seed" },
      { type: "evict", seatId: 2 },
      { type: "call", playerId: 1 },
      { type: "call", playerId: 0 },
    ];
    const original = collectingWritable();
    await runHarness({
      state: createInitialState([...seats]),
      input: Readable.from(commands.map((c) => JSON.stringify(c) + "\n")),
      output: original.writable,
      log,
    });

    const hand1 = handLogPaths(path.join(logDir, "game-1"), 1);

    // Re-pipe the persisted command log (the file on disk, unmodified) through
    // a fresh harness instance with no logging attached.
    const replayed = collectingWritable();
    await runHarness({
      state: createInitialState([...seats]),
      input: createReadStream(hand1.commandsPath),
      output: replayed.writable,
    });

    const replayedEvents = replayed
      .lines()
      .map((line) => JSON.parse(line) as HandEvent | Rejection);

    const persisted = readJsonLines(hand1.eventsPath) as ((
      HandEvent | Rejection
    ) & { v: number })[];

    expect(persisted.every((r) => r.v === ENGINE_LOG_VERSION)).toBe(true);
    expect(replayedEvents).toEqual(persisted.map(withoutVersion));
    expect(replayed.lines()).toEqual(original.lines());
  });
});
