import { Readable, Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  createInitialState,
  ENGINE_LOG_VERSION,
} from "@table-top-poker/engine";
import {
  createMemoryFileSystem,
  DirectoryRecordings,
  handRecordingPaths,
} from "@table-top-poker/recording";
import type {
  MemoryFileSystem,
  RoomRecording,
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

describe("runHarness", () => {
  it("folds each event into state and writes one JSON line per event", async () => {
    const commands = [
      { type: "startHand", seatId: 0, seed: "seed-1" },
      { type: "call", seatId: 1 },
    ];
    const input = Readable.from(
      commands.map((command) => JSON.stringify(command) + "\n"),
    );
    const { writable, lines } = collectingWritable();

    await runHarness({
      state: createInitialState([0, 1, 2]),
      input,
      output: writable,
    });

    const events = lines().map(
      (line: string) => JSON.parse(line) as { type: string },
    );
    expect(events.map((e) => e.type)).toEqual([
      "HandStarted",
      "HoleCardsDealt",
      "StreetStarted",
      "ActionTaken",
    ]);
  });

  it("writes a Rejection line, distinguishable from events, without throwing", async () => {
    const commands = [{ type: "call", seatId: 1 }];
    const input = Readable.from(
      commands.map((command) => JSON.stringify(command) + "\n"),
    );
    const { writable, lines } = collectingWritable();

    await runHarness({
      state: createInitialState([0, 1, 2]),
      input,
      output: writable,
    });

    const [line] = lines();
    const parsed = JSON.parse(line ?? "") as { type: string; reason?: string };
    expect(parsed.type).toBe("Rejection");
    expect(parsed.reason).toBe("hand-not-in-progress");
  });

  it("skips blank lines in the input", async () => {
    const input = Readable.from([
      "\n",
      JSON.stringify({ type: "startHand", seatId: 0, seed: "seed-1" }) + "\n",
      "\n",
    ]);
    const { writable, lines } = collectingWritable();

    await runHarness({
      state: createInitialState([0, 1, 2]),
      input,
      output: writable,
    });

    expect(lines()).toHaveLength(3);
  });

  it("is deterministic: replaying the same command stream twice produces byte-identical output", async () => {
    const commandLines = [
      JSON.stringify({ type: "startHand", seatId: 0, seed: "seed-1" }),
      JSON.stringify({ type: "call", seatId: 1 }),
      JSON.stringify({ type: "raise", seatId: 2 }),
    ];

    async function run(): Promise<string> {
      const input = Readable.from(commandLines.map((line) => line + "\n"));
      const { writable, lines } = collectingWritable();
      await runHarness({
        state: createInitialState([0, 1, 2]),
        input,
        output: writable,
      });
      return lines().join("\n");
    }

    const first = await run();
    const second = await run();
    expect(second).toBe(first);
  });

  it("fails fast on a malformed JSON line instead of writing a corrupt record", async () => {
    const input = Readable.from(["not json\n"]);
    const { writable } = collectingWritable();

    await expect(
      runHarness({
        state: createInitialState([0, 1, 2]),
        input,
        output: writable,
      }),
    ).rejects.toThrow(/invalid JSON/);
  });

  it("fails fast on a command type the engine doesn't recognize", async () => {
    const input = Readable.from([
      JSON.stringify({ type: "bogus", seatId: 0 }) + "\n",
    ]);
    const { writable } = collectingWritable();

    await expect(
      runHarness({
        state: createInitialState([0, 1, 2]),
        input,
        output: writable,
      }),
    ).rejects.toThrow(/unrecognized command/);
  });

  it("accepts a logged command line (bare Command plus an extra v field) the same as a plain command", async () => {
    const input = Readable.from([
      JSON.stringify({
        type: "startHand",
        seatId: 0,
        seed: "seed-1",
        v: ENGINE_LOG_VERSION,
      }) + "\n",
    ]);
    const { writable, lines } = collectingWritable();

    await runHarness({
      state: createInitialState([0, 1, 2]),
      input,
      output: writable,
    });

    const events = lines().map(
      (line: string) => JSON.parse(line) as { type: string },
    );
    expect(events[0]?.type).toBe("HandStarted");
  });

  describe("with recording enabled", () => {
    const RECORDINGS_ROOT = "/recordings";
    const ROOM_ID = "harness-room";
    const ROOM_DIR = `${RECORDINGS_ROOT}/${ROOM_ID}`;

    async function openRecording(
      fileSystem: MemoryFileSystem,
    ): Promise<RoomRecording> {
      const recordings = new DirectoryRecordings(RECORDINGS_ROOT, fileSystem);
      return recordings.create({
        roomId: ROOM_ID,
        code: null,
        createdAt: "2026-08-13T20:00:00.000Z",
      });
    }

    function recordedLines(
      fileSystem: MemoryFileSystem,
      filePath: string,
    ): { type: string; v: number; reason?: string }[] {
      return (fileSystem.read(filePath) ?? "")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { type: string; v: number });
    }

    it("records every command and event without changing stdout", async () => {
      const fileSystem = createMemoryFileSystem();
      const recording = await openRecording(fileSystem);
      const commandLines = [
        JSON.stringify({ type: "startHand", seatId: 0, seed: "seed-1" }),
        JSON.stringify({ type: "call", seatId: 1 }),
      ];
      const input = Readable.from(commandLines.map((line) => line + "\n"));
      const { writable, lines } = collectingWritable();

      await runHarness({
        state: createInitialState([0, 1, 2]),
        input,
        output: writable,
        recording,
      });

      const hand1 = handRecordingPaths(ROOM_DIR, 1);
      const recordedCommands = recordedLines(fileSystem, hand1.commandsPath);
      expect(recordedCommands.map((r) => r.type)).toEqual([
        "startHand",
        "call",
      ]);
      expect(recordedCommands.every((r) => r.v === ENGINE_LOG_VERSION)).toBe(
        true,
      );

      const recordedEvents = recordedLines(fileSystem, hand1.eventsPath);
      expect(recordedEvents.map((r) => r.type)).toEqual(
        lines().map((line) => (JSON.parse(line) as { type: string }).type),
      );
      expect(recordedEvents.every((r) => r.v === ENGINE_LOG_VERSION)).toBe(
        true,
      );
    });

    it("opens each Hand with a context sidecar carrying its seats and button", async () => {
      const fileSystem = createMemoryFileSystem();
      const recording = await openRecording(fileSystem);
      const input = Readable.from([
        JSON.stringify({ type: "startHand", seatId: 0, seed: "seed-1" }) + "\n",
      ]);
      const { writable } = collectingWritable();

      await runHarness({
        state: createInitialState([0, 1, 2]),
        input,
        output: writable,
        recording,
        now: () => new Date("2026-08-13T20:01:00.000Z"),
      });

      const hand1 = handRecordingPaths(ROOM_DIR, 1);
      expect(JSON.parse(fileSystem.read(hand1.contextPath) ?? "")).toEqual({
        v: ENGINE_LOG_VERSION,
        roomId: ROOM_ID,
        handOrdinal: 1,
        startedAt: "2026-08-13T20:01:00.000Z",
        seats: [0, 1, 2],
        button: 0,
      });
    });

    it("records a Rejection raised mid-hand as that hand's outcome", async () => {
      const fileSystem = createMemoryFileSystem();
      const recording = await openRecording(fileSystem);
      const input = Readable.from(
        [
          { type: "startHand", seatId: 0, seed: "seed-1" },
          { type: "check", seatId: 1 },
        ].map((command) => JSON.stringify(command) + "\n"),
      );
      const { writable } = collectingWritable();

      await runHarness({
        state: createInitialState([0, 1, 2]),
        input,
        output: writable,
        recording,
      });

      const hand1 = handRecordingPaths(ROOM_DIR, 1);
      const rejection = recordedLines(fileSystem, hand1.eventsPath).at(-1);
      expect(rejection?.type).toBe("Rejection");
      expect(rejection?.reason).toBe("action-not-legal");
    });
  });
});
