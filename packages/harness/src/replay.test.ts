import { Readable, Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  ENGINE_LOG_VERSION,
} from "@table-top-poker/engine";
import type { HandEvent, Rejection } from "@table-top-poker/engine";
import {
  createMemoryFileSystem,
  DirectoryRecordings,
  handRecordingPaths,
} from "@table-top-poker/recording";
import { runHarness } from "./harness.js";

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

function parseJsonLines(contents: string): unknown[] {
  return contents
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
  const RECORDINGS_ROOT = "/recordings";
  const ROOM_ID = "replay-room";

  it("re-piping a persisted command stream through the harness reproduces the persisted event stream exactly", async () => {
    const fileSystem = createMemoryFileSystem();
    const recordings = new DirectoryRecordings(RECORDINGS_ROOT, fileSystem);
    const recording = await recordings.create({
      roomId: ROOM_ID,
      code: null,
      createdAt: "2026-08-13T20:00:00.000Z",
    });
    const seats = [0, 1, 2] as const;

    const commands = [
      { type: "startHand", seatId: 0, seed: "replay-seed" },
      { type: "evict", seatId: 2 },
      { type: "call", seatId: 0 },
      { type: "call", seatId: 1 },
    ];
    const original = collectingWritable();
    await runHarness({
      state: createInitialState([...seats]),
      input: Readable.from(commands.map((c) => JSON.stringify(c) + "\n")),
      output: original.writable,
      recording,
    });
    await recording.close();

    const hand1 = handRecordingPaths(`${RECORDINGS_ROOT}/${ROOM_ID}`, 1);
    const recordedCommands = fileSystem.read(hand1.commandsPath) ?? "";

    const replayed = collectingWritable();
    await runHarness({
      state: createInitialState([...seats]),
      input: Readable.from([recordedCommands]),
      output: replayed.writable,
    });

    const replayedEvents = replayed
      .lines()
      .map((line) => JSON.parse(line) as HandEvent | Rejection);

    const persisted = parseJsonLines(
      fileSystem.read(hand1.eventsPath) ?? "",
    ) as ((HandEvent | Rejection) & { v: number })[];

    expect(persisted.every((r) => r.v === ENGINE_LOG_VERSION)).toBe(true);
    expect(replayedEvents).toEqual(persisted.map(withoutVersion));
    expect(replayed.lines()).toEqual(original.lines());
  });
});
