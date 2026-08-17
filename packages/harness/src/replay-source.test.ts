import {
  mkdtempSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { createInitialState } from "@table-top-poker/engine";
import { DirectoryRecordings } from "@table-top-poker/recording";
import { runHarness } from "./harness.js";
import {
  loadHand,
  ReplaySourceError,
  resolveRoomDirectory,
} from "./replay-source.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "replay-source-"));
  dirs.push(dir);
  return dir;
}

function nullWritable(): Writable {
  return new Writable({
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
}

async function seedRoom(
  recordingsDir: string,
  roomId: string,
  options: { code?: string | null; createdAt?: string } = {},
): Promise<void> {
  const recordings = new DirectoryRecordings(recordingsDir);
  const recording = await recordings.create({
    roomId,
    code: options.code ?? null,
    createdAt: options.createdAt ?? "2026-08-13T20:00:00.000Z",
  });
  const commands = [
    { type: "startHand", seatId: 0, seed: "seed-1" },
    { type: "call", seatId: 1 },
    { type: "call", seatId: 2 },
  ];
  await runHarness({
    state: createInitialState([0, 1, 2]),
    input: Readable.from(commands.map((c) => JSON.stringify(c) + "\n")),
    output: nullWritable(),
    recording,
  });
  await recording.close();
}

describe("resolveRoomDirectory", () => {
  it("takes an existing path literally", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a");
    const roomDir = path.join(recordingsDir, "room-a");

    await expect(
      resolveRoomDirectory(roomDir, recordingsDir),
    ).resolves.toMatchObject({ roomDir });
  });

  it("resolves a bare Room ID relative to recordingsDir — the harness's own --room-id echoed back", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "smoke-room");

    await expect(
      resolveRoomDirectory("smoke-room", recordingsDir),
    ).resolves.toMatchObject({
      roomDir: path.join(recordingsDir, "smoke-room"),
    });
  });

  it("resolves 'latest' to the most recently created room", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-old", {
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    await seedRoom(recordingsDir, "room-new", {
      createdAt: "2026-08-15T00:00:00.000Z",
    });

    const resolved = await resolveRoomDirectory("latest", recordingsDir);
    expect(resolved.roomDir).toBe(path.join(recordingsDir, "room-new"));
    expect(resolved.note).toMatch(/resolved "latest"/);
  });

  it("resolves a join code by scanning room.json files", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a", { code: "AB12" });

    const resolved = await resolveRoomDirectory("AB12", recordingsDir);
    expect(resolved.roomDir).toBe(path.join(recordingsDir, "room-a"));
  });

  it("resolves a recycled join code to the most recently created match", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-old", {
      code: "AB12",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    await seedRoom(recordingsDir, "room-new", {
      code: "AB12",
      createdAt: "2026-08-15T00:00:00.000Z",
    });

    const resolved = await resolveRoomDirectory("AB12", recordingsDir);
    expect(resolved.roomDir).toBe(path.join(recordingsDir, "room-new"));
    expect(resolved.note).toMatch(/most recent of several matches/);
  });

  it("resolves deterministically when several matches share the same createdAt", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-1", {
      code: "AB12",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    await seedRoom(recordingsDir, "room-2", {
      code: "AB12",
      createdAt: "2026-08-01T00:00:00.000Z",
    });
    await seedRoom(recordingsDir, "room-3", {
      code: "AB12",
      createdAt: "2026-08-01T00:00:00.000Z",
    });

    const first = await resolveRoomDirectory("AB12", recordingsDir);
    const second = await resolveRoomDirectory("AB12", recordingsDir);
    expect(second.roomDir).toBe(first.roomDir);
  });

  it("fails when no room.json matches the given code", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a", { code: "AB12" });

    await expect(resolveRoomDirectory("ZZ99", recordingsDir)).rejects.toThrow(
      ReplaySourceError,
    );
  });

  it("fails when recordingsDir does not exist and 'latest' is requested", async () => {
    const recordingsDir = path.join(tempDir(), "does-not-exist");
    await expect(resolveRoomDirectory("latest", recordingsDir)).rejects.toThrow(
      ReplaySourceError,
    );
  });
});

describe("loadHand", () => {
  it("reads a complete hand into a ReplayInput", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a");

    const loaded = await loadHand(
      path.join(recordingsDir, "room-a"),
      1,
      recordingsDir,
    );
    expect(loaded.roomDir).toBe(path.join(recordingsDir, "room-a"));
    expect(loaded.input.commands.map((c) => c.type)).toEqual([
      "startHand",
      "call",
      "call",
    ]);
    expect(loaded.input.tornRecord).toBeNull();
  });

  it("fails when room.json is missing", async () => {
    const recordingsDir = tempDir();
    const roomDir = path.join(recordingsDir, "ghost");
    await expect(loadHand(roomDir, 1, recordingsDir)).rejects.toThrow(
      ReplaySourceError,
    );
  });

  it("fails when room.json carries an unsupported layout version", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a");
    const manifestPath = path.join(recordingsDir, "room-a", "room.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
      string,
      unknown
    >;
    writeFileSync(
      manifestPath,
      JSON.stringify({ ...manifest, layoutVersion: 999 }) + "\n",
    );

    await expect(
      loadHand(path.join(recordingsDir, "room-a"), 1, recordingsDir),
    ).rejects.toMatchObject({
      failure: { kind: "unsupported-version", expected: 1, actual: 999 },
    });
  });

  it("fails when the hand's context file is missing", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a");

    await expect(
      loadHand(path.join(recordingsDir, "room-a"), 2, recordingsDir),
    ).rejects.toMatchObject({
      failure: { kind: "missing-file" },
    });
  });

  it("reports a torn final line in events.jsonl without failing the earlier lines", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a");
    const eventsPath = path.join(
      recordingsDir,
      "room-a",
      "hand-0001.events.jsonl",
    );
    const original = readFileSync(eventsPath, "utf8");
    const lastNewline = original.lastIndexOf("\n", original.length - 2);
    truncateSync(eventsPath, lastNewline + 10);

    const loaded = await loadHand(
      path.join(recordingsDir, "room-a"),
      1,
      recordingsDir,
    );
    expect(loaded.input.tornRecord).not.toBeNull();
    expect(loaded.input.tornRecord?.file).toBe(eventsPath);
    expect(loaded.input.events.length).toBeGreaterThan(0);
  });

  it("fails on a malformed non-final line in commands.jsonl", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a");
    const commandsPath = path.join(
      recordingsDir,
      "room-a",
      "hand-0001.commands.jsonl",
    );
    const lines = readFileSync(commandsPath, "utf8").split("\n");
    lines[0] = "{not valid json";
    writeFileSync(commandsPath, lines.join("\n"));

    await expect(
      loadHand(path.join(recordingsDir, "room-a"), 1, recordingsDir),
    ).rejects.toMatchObject({
      failure: { kind: "malformed-record", line: 1 },
    });
  });

  it("treats a missing events file as an empty stream (orphaned trailing Command)", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a");
    const eventsPath = path.join(
      recordingsDir,
      "room-a",
      "hand-0001.events.jsonl",
    );
    writeFileSync(eventsPath, "");

    const loaded = await loadHand(
      path.join(recordingsDir, "room-a"),
      1,
      recordingsDir,
    );
    expect(loaded.input.events).toEqual([]);
    expect(loaded.input.commands.length).toBeGreaterThan(0);
  });
});
