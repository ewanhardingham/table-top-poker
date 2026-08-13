import { describe, expect, it } from "vitest";
import { ENGINE_LOG_VERSION } from "@table-top-poker/engine";
import type { Command, HandEvent, Rejection } from "@table-top-poker/engine";
import { createMemoryFileSystem, parseRecordedLines } from "./testing.js";
import type { MemoryFileSystem } from "./testing.js";
import { handRecordingPaths, roomManifestPath } from "./paths.js";
import { RECORDING_LAYOUT_VERSION } from "./records.js";
import type { HandStartContext } from "./records.js";
import { DirectoryRecordings } from "./recordings.js";
import type { RoomRecording } from "./room-recording.js";

const ROOM_ID = "11111111-2222-3333-4444-555555555555";
const ROOT = "/recordings";
const ROOM_DIR = `${ROOT}/${ROOM_ID}`;

const startHand: Command = { type: "startHand", seatId: 0, seed: "seed-1" };
const handStarted: HandEvent = {
  type: "HandStarted",
  seed: "seed-1",
  button: 0,
};
const nextHand: Command = { type: "nextHand", seatId: 0, seed: "seed-2" };
const handStarted2: HandEvent = {
  type: "HandStarted",
  seed: "seed-2",
  button: 1,
};

function context(startedAt = "2026-08-13T20:00:00.000Z"): HandStartContext {
  return { startedAt, seats: [0, 1, 2], button: 0 };
}

function lines(fs: MemoryFileSystem, filePath: string): unknown[] {
  return parseRecordedLines(fs.read(filePath));
}

async function openRecording(
  fs: MemoryFileSystem,
  retries = 0,
): Promise<RoomRecording> {
  const recordings = new DirectoryRecordings(ROOT, fs, retries);
  return recordings.create({
    roomId: ROOM_ID,
    code: "ABCD",
    createdAt: "2026-08-13T19:59:00.000Z",
  });
}

describe("DirectoryRecordings.create", () => {
  it("writes an immutable room.json before the recording is usable", async () => {
    const fs = createMemoryFileSystem();
    await openRecording(fs);

    expect(lines(fs, roomManifestPath(ROOM_DIR))).toEqual([
      {
        layoutVersion: RECORDING_LAYOUT_VERSION,
        roomId: ROOM_ID,
        code: "ABCD",
        createdAt: "2026-08-13T19:59:00.000Z",
      },
    ]);
  });

  it("publishes room.json by rename, so a reader never sees a half-written manifest", async () => {
    const fs = createMemoryFileSystem();
    fs.failNext("rename");

    await expect(openRecording(fs)).rejects.toThrow(/could not create/);
    expect(fs.read(roomManifestPath(ROOM_DIR))).toBeUndefined();
  });

  it("rolls the directory back when the manifest cannot be written", async () => {
    const fs = createMemoryFileSystem();
    fs.failNext("writeFile");

    await expect(openRecording(fs)).rejects.toThrow(/could not create/);
    expect(fs.paths()).toEqual([]);
  });

  it.each(["../escape", "..", ".", "has spaces", "nested/id", ""])(
    "rejects the room id %o, which cannot name a directory of its own",
    async (roomId) => {
      const recordings = new DirectoryRecordings(
        ROOT,
        createMemoryFileSystem(),
      );
      await expect(
        recordings.create({
          roomId,
          code: null,
          createdAt: "2026-08-13T19:59:00.000Z",
        }),
      ).rejects.toThrow(/room id/);
    },
  );

  it("refuses to reopen a directory that already holds a recording", async () => {
    const fs = createMemoryFileSystem();
    await openRecording(fs);

    await expect(openRecording(fs)).rejects.toThrow(/already exists/);
  });

  it("rolls back only what it created, never a recording already on disk", async () => {
    const fs = createMemoryFileSystem();
    // A previous run under the same room id — the harness's `--room-id` is a
    // developer-chosen label, so this is reachable in practice.
    const recording = await openRecording(fs);
    await recording.append({
      context: context(),
      command: startHand,
      outcome: [handStarted],
    });
    const before = fs.paths();

    // `room.json` is immutable, so the reopen is refused rather than rolled
    // back over — and nothing already written is touched either way.
    await expect(openRecording(fs)).rejects.toThrow();
    expect(fs.paths()).toEqual(before);
  });

  it("records a code of null for a recording that was never joinable", async () => {
    const fs = createMemoryFileSystem();
    const recordings = new DirectoryRecordings(ROOT, fs);
    await recordings.create({
      roomId: ROOM_ID,
      code: null,
      createdAt: "2026-08-13T19:59:00.000Z",
    });

    expect(lines(fs, roomManifestPath(ROOM_DIR))[0]).toMatchObject({
      code: null,
    });
  });
});

describe("DirectoryRecordings.ensureWritable", () => {
  it("succeeds against a writable root, leaving no probe behind", async () => {
    const fs = createMemoryFileSystem();
    await new DirectoryRecordings(ROOT, fs).ensureWritable();

    expect(fs.paths()).toEqual([]);
  });

  it("fails when the root cannot be created", async () => {
    const fs = createMemoryFileSystem();
    fs.failAlways("mkdir");

    await expect(
      new DirectoryRecordings(ROOT, fs).ensureWritable(),
    ).rejects.toThrow(/recordings root/);
  });

  it("fails when the root exists but refuses writes", async () => {
    const fs = createMemoryFileSystem();
    fs.failAlways("writeFile");

    await expect(
      new DirectoryRecordings(ROOT, fs).ensureWritable(),
    ).rejects.toThrow(/recordings root/);
  });
});

describe("RoomRecording.append", () => {
  it("opens a Hand with its context sidecar, carrying no cards and no state", async () => {
    const fs = createMemoryFileSystem();
    const recording = await openRecording(fs);

    await recording.append({
      context: context(),
      command: startHand,
      outcome: [handStarted],
    });

    const hand1 = handRecordingPaths(ROOM_DIR, 1);
    expect(JSON.parse(fs.read(hand1.contextPath) ?? "")).toEqual({
      v: ENGINE_LOG_VERSION,
      roomId: ROOM_ID,
      handOrdinal: 1,
      startedAt: "2026-08-13T20:00:00.000Z",
      seats: [0, 1, 2],
      button: 0,
    });
  });

  it("writes the command and its events as version-tagged JSONL", async () => {
    const fs = createMemoryFileSystem();
    const recording = await openRecording(fs);

    await recording.append({
      context: context(),
      command: startHand,
      outcome: [handStarted],
    });

    const hand1 = handRecordingPaths(ROOM_DIR, 1);
    expect(lines(fs, hand1.commandsPath)).toEqual([
      { ...startHand, v: ENGINE_LOG_VERSION },
    ]);
    expect(lines(fs, hand1.eventsPath)).toEqual([
      { ...handStarted, v: ENGINE_LOG_VERSION },
    ]);
  });

  it("records a Rejection as this hand's outcome without disturbing the command stream", async () => {
    const fs = createMemoryFileSystem();
    const recording = await openRecording(fs);
    const rejected: Command = { type: "check", seatId: 1 };
    const rejection: Rejection = {
      type: "Rejection",
      reason: "not-your-turn",
      command: rejected,
    };

    await recording.append({
      context: context(),
      command: startHand,
      outcome: [handStarted],
    });
    await recording.append({ command: rejected, outcome: rejection });

    const hand1 = handRecordingPaths(ROOM_DIR, 1);
    expect(lines(fs, hand1.commandsPath)).toEqual([
      { ...startHand, v: ENGINE_LOG_VERSION },
      { ...rejected, v: ENGINE_LOG_VERSION },
    ]);
    expect(lines(fs, hand1.eventsPath).at(-1)).toEqual({
      ...rejection,
      v: ENGINE_LOG_VERSION,
    });
  });

  it("partitions each Hand into its own file triplet", async () => {
    const fs = createMemoryFileSystem();
    const recording = await openRecording(fs);

    await recording.append({
      context: context(),
      command: startHand,
      outcome: [handStarted],
    });
    await recording.append({
      context: {
        startedAt: "2026-08-13T20:05:00.000Z",
        seats: [0, 1],
        button: 1,
      },
      command: nextHand,
      outcome: [handStarted2],
    });

    const hand2 = handRecordingPaths(ROOM_DIR, 2);
    expect(lines(fs, hand2.commandsPath)).toEqual([
      { ...nextHand, v: ENGINE_LOG_VERSION },
    ]);
    expect(JSON.parse(fs.read(hand2.contextPath) ?? "")).toMatchObject({
      handOrdinal: 2,
      button: 1,
      seats: [0, 1],
    });
  });

  it("drops an operation arriving before any Hand has started — there is nothing to partition it into", async () => {
    const fs = createMemoryFileSystem();
    const recording = await openRecording(fs);

    await recording.append({
      command: { type: "call", seatId: 1 },
      outcome: {
        type: "Rejection",
        reason: "hand-not-in-progress",
        command: { type: "call", seatId: 1 },
      },
    });

    expect(fs.paths()).toEqual([roomManifestPath(ROOM_DIR)]);
  });

  it("keeps concurrent appends in call order", async () => {
    const fs = createMemoryFileSystem();
    const recording = await openRecording(fs);

    const calls: Command[] = [
      { type: "call", seatId: 1 },
      { type: "call", seatId: 2 },
      { type: "fold", seatId: 0 },
    ];
    await Promise.all([
      recording.append({
        context: context(),
        command: startHand,
        outcome: [handStarted],
      }),
      ...calls.map((command) => recording.append({ command, outcome: [] })),
    ]);

    const hand1 = handRecordingPaths(ROOM_DIR, 1);
    expect(
      (lines(fs, hand1.commandsPath) as Command[]).map((c) => c.type),
    ).toEqual(["startHand", "call", "call", "fold"]);
  });

  it("rolls a partial operation back to the last confirmed offsets", async () => {
    const fs = createMemoryFileSystem();
    const recording = await openRecording(fs);
    await recording.append({
      context: context(),
      command: startHand,
      outcome: [handStarted],
    });
    const hand1 = handRecordingPaths(ROOM_DIR, 1);
    const confirmedCommands = fs.read(hand1.commandsPath);
    const confirmedEvents = fs.read(hand1.eventsPath);

    // The command lands, then the events write fails: without a rollback the
    // command file would carry a line no event file can account for.
    fs.failWhen("appendFile", (target) => target.endsWith(".events.jsonl"));
    await expect(
      recording.append({
        command: { type: "call", seatId: 1 },
        outcome: [{ type: "ActionTaken", seatId: 1, action: "call" }],
      }),
    ).rejects.toThrow(/append failed/);

    expect(fs.read(hand1.commandsPath)).toBe(confirmedCommands);
    expect(fs.read(hand1.eventsPath)).toBe(confirmedEvents);
  });

  it("retries a transient failure and confirms the operation", async () => {
    const fs = createMemoryFileSystem();
    const recording = await openRecording(fs, 2);
    await recording.append({
      context: context(),
      command: startHand,
      outcome: [handStarted],
    });

    fs.failNext("appendFile");
    await recording.append({
      command: { type: "call", seatId: 1 },
      outcome: [{ type: "ActionTaken", seatId: 1, action: "call" }],
    });

    const hand1 = handRecordingPaths(ROOM_DIR, 1);
    expect(
      (lines(fs, hand1.commandsPath) as Command[]).map((c) => c.type),
    ).toEqual(["startHand", "call"]);
    expect(lines(fs, hand1.eventsPath)).toHaveLength(2);
  });

  it("removes the context sidecar when the operation that opened the Hand fails outright", async () => {
    const fs = createMemoryFileSystem();
    const recording = await openRecording(fs);

    fs.failAlways("appendFile");
    await expect(
      recording.append({
        context: context(),
        command: startHand,
        outcome: [handStarted],
      }),
    ).rejects.toThrow(/append failed/);

    const hand1 = handRecordingPaths(ROOM_DIR, 1);
    expect(fs.read(hand1.contextPath)).toBeUndefined();
  });

  it("refuses every later operation once one has failed, rather than writing past the gap", async () => {
    const fs = createMemoryFileSystem();
    const recording = await openRecording(fs);
    await recording.append({
      context: context(),
      command: startHand,
      outcome: [handStarted],
    });

    fs.failAlways("appendFile");
    await expect(
      recording.append({ command: { type: "call", seatId: 1 }, outcome: [] }),
    ).rejects.toThrow(/append failed/);

    fs.healAll();
    await expect(
      recording.append({ command: { type: "call", seatId: 2 }, outcome: [] }),
    ).rejects.toThrow(/recording-paused/);
  });
});

describe("RoomRecording.close", () => {
  it("drains operations already queued before resolving", async () => {
    const fs = createMemoryFileSystem();
    const recording = await openRecording(fs);

    const pending = recording.append({
      context: context(),
      command: startHand,
      outcome: [handStarted],
    });
    const closed = recording.close();
    await Promise.all([pending, closed]);

    const hand1 = handRecordingPaths(ROOM_DIR, 1);
    expect(lines(fs, hand1.commandsPath)).toHaveLength(1);
  });

  it("refuses operations arriving after the close", async () => {
    const fs = createMemoryFileSystem();
    const recording = await openRecording(fs);
    await recording.close();

    await expect(
      recording.append({
        context: context(),
        command: startHand,
        outcome: [handStarted],
      }),
    ).rejects.toThrow(/closed/);
  });
});
