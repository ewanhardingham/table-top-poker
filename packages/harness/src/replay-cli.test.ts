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
import type { Command } from "@table-top-poker/engine";
import { DirectoryRecordings } from "@table-top-poker/recording";
import { runHarness } from "./harness.js";
import { runReplayCli } from "./replay-cli.js";

const dirs: string[] = [];

afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "replay-cli-"));
  dirs.push(dir);
  return dir;
}

function collectingWritable(): { writable: Writable; text: () => string } {
  const chunks: string[] = [];
  const writable = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString("utf8"));
      callback();
    },
  });
  return { writable, text: () => chunks.join("") };
}

function lines(text: string): string[] {
  return text.split("\n").filter((line) => line !== "");
}

async function seedRoom(
  recordingsDir: string,
  roomId: string,
  commands: Command[],
  options: { code?: string | null; createdAt?: string } = {},
): Promise<void> {
  const recordings = new DirectoryRecordings(recordingsDir);
  const recording = await recordings.create({
    roomId,
    code: options.code ?? null,
    createdAt: options.createdAt ?? "2026-08-13T20:00:00.000Z",
  });
  await runHarness({
    state: createInitialState([0, 1, 2]),
    input: Readable.from(commands.map((c) => JSON.stringify(c) + "\n")),
    output: collectingWritable().writable,
    recording,
  });
  await recording.close();
}

const HAPPY_COMMANDS: Command[] = [
  { type: "startHand", seatId: 0, seed: "cli-seed" },
  { type: "call", seatId: 0 },
];

describe("runReplayCli", () => {
  it("emits a complete replay to stdout and exits 0", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a", HAPPY_COMMANDS);
    const stdout = collectingWritable();
    const stderr = collectingWritable();

    const exitCode = await runReplayCli(
      [path.join(recordingsDir, "room-a"), "--hand", "1"],
      { stdout: stdout.writable, stderr: stderr.writable },
    );

    expect(exitCode).toBe(0);
    expect(stderr.text()).toBe("");
    const records = lines(stdout.text()).map(
      (line) =>
        JSON.parse(line) as { kind: string; hand: number; position: number },
    );
    expect(records[0]).toMatchObject({
      kind: "position",
      hand: 1,
      position: 0,
    });
    expect(records.every((r) => r.hand === 1)).toBe(true);
    expect(records.map((r) => r.kind)).not.toContain("rejection");
  });

  it("re-running the same replay is byte-identical", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a", HAPPY_COMMANDS);
    const roomDir = path.join(recordingsDir, "room-a");

    async function run(): Promise<string> {
      const stdout = collectingWritable();
      await runReplayCli([roomDir, "--hand", "1"], {
        stdout: stdout.writable,
        stderr: collectingWritable().writable,
      });
      return stdout.text();
    }

    expect(await run()).toBe(await run());
  });

  it("resolves 'latest' and prints the chosen directory to stderr, never stdout", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a", HAPPY_COMMANDS);
    const stdout = collectingWritable();
    const stderr = collectingWritable();

    const exitCode = await runReplayCli(
      ["latest", "--hand", "1", "--recordings-dir", recordingsDir],
      { stdout: stdout.writable, stderr: stderr.writable },
    );

    expect(exitCode).toBe(0);
    expect(stderr.text()).toMatch(/resolved "latest"/);
    expect(stdout.text()).not.toMatch(/resolved/);
  });

  it("resolves a join code and prints the chosen directory to stderr, never stdout", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a", HAPPY_COMMANDS, { code: "AB12" });
    const stdout = collectingWritable();
    const stderr = collectingWritable();

    const exitCode = await runReplayCli(
      ["AB12", "--hand", "1", "--recordings-dir", recordingsDir],
      { stdout: stdout.writable, stderr: stderr.writable },
    );

    expect(exitCode).toBe(0);
    expect(stderr.text()).toMatch(/resolved join code "AB12"/);
    expect(stdout.text()).not.toMatch(/resolved/);
  });

  it("stdout is byte-identical whether the room is addressed by path, join code, or 'latest'", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a", HAPPY_COMMANDS, { code: "AB12" });

    async function run(room: string): Promise<string> {
      const stdout = collectingWritable();
      await runReplayCli(
        [room, "--hand", "1", "--recordings-dir", recordingsDir],
        { stdout: stdout.writable, stderr: collectingWritable().writable },
      );
      return stdout.text();
    }

    const byPath = await run(path.join(recordingsDir, "room-a"));
    expect(await run("AB12")).toBe(byPath);
    expect(await run("latest")).toBe(byPath);
  });

  it("a join code matching no recording fails with exit 1 and a diagnostic on stderr, nothing on stdout", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a", HAPPY_COMMANDS, { code: "AB12" });
    const stdout = collectingWritable();
    const stderr = collectingWritable();

    const exitCode = await runReplayCli(
      ["ZZ99", "--hand", "1", "--recordings-dir", recordingsDir],
      { stdout: stdout.writable, stderr: stderr.writable },
    );

    expect(exitCode).toBe(1);
    expect(stdout.text()).toBe("");
    expect(stderr.text()).toMatch(/missing-file/);
  });

  it("'latest' against an empty recordings directory fails with exit 1 and a diagnostic on stderr, nothing on stdout", async () => {
    const recordingsDir = tempDir();
    const stdout = collectingWritable();
    const stderr = collectingWritable();

    const exitCode = await runReplayCli(
      ["latest", "--hand", "1", "--recordings-dir", recordingsDir],
      { stdout: stdout.writable, stderr: stderr.writable },
    );

    expect(exitCode).toBe(1);
    expect(stdout.text()).toBe("");
    expect(stderr.text()).toMatch(/missing-file/);
  });

  it("interleaves a Rejection with the position it occurred at", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a", [
      { type: "startHand", seatId: 0, seed: "cli-seed" },
      { type: "check", seatId: 1 }, // out of turn: seat 0 acts first preflop here
      { type: "call", seatId: 0 },
    ]);
    const stdout = collectingWritable();

    const exitCode = await runReplayCli(
      [path.join(recordingsDir, "room-a"), "--hand", "1"],
      { stdout: stdout.writable, stderr: collectingWritable().writable },
    );

    expect(exitCode).toBe(0);
    const records = lines(stdout.text()).map(
      (line) => JSON.parse(line) as { kind: string },
    );
    expect(records.some((r) => r.kind === "rejection")).toBe(true);
  });

  it("--at emits exactly one position", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a", HAPPY_COMMANDS);
    const stdout = collectingWritable();

    const exitCode = await runReplayCli(
      [path.join(recordingsDir, "room-a"), "--hand", "1", "--at", "0"],
      { stdout: stdout.writable, stderr: collectingWritable().writable },
    );

    expect(exitCode).toBe(0);
    const records = lines(stdout.text());
    expect(records).toHaveLength(1);
    expect(JSON.parse(records[0] ?? "")).toMatchObject({
      kind: "position",
      position: 0,
      event: null,
    });
  });

  it("writes nothing to stdout and exits 1 on a missing Hand", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a", HAPPY_COMMANDS);
    const stdout = collectingWritable();
    const stderr = collectingWritable();

    const exitCode = await runReplayCli(
      [path.join(recordingsDir, "room-a"), "--hand", "2"],
      { stdout: stdout.writable, stderr: stderr.writable },
    );

    expect(exitCode).toBe(1);
    expect(stdout.text()).toBe("");
    expect(stderr.text()).toMatch(/missing-file/);
  });

  it("exits 1 on bad arguments without touching the filesystem", async () => {
    const stdout = collectingWritable();
    const stderr = collectingWritable();

    const exitCode = await runReplayCli(["room-a"], {
      stdout: stdout.writable,
      stderr: stderr.writable,
    });

    expect(exitCode).toBe(1);
    expect(stdout.text()).toBe("");
    expect(stderr.text()).toMatch(/--hand/);
  });

  it("exits 2 with the validated prefix on a torn final events record", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a", HAPPY_COMMANDS);
    const eventsPath = path.join(
      recordingsDir,
      "room-a",
      "hand-0001.events.jsonl",
    );
    const original = readFileSync(eventsPath, "utf8");
    const lastNewline = original.lastIndexOf("\n", original.length - 2);
    truncateSync(eventsPath, lastNewline + 6);

    const stdout = collectingWritable();
    const stderr = collectingWritable();
    const exitCode = await runReplayCli(
      [path.join(recordingsDir, "room-a"), "--hand", "1"],
      { stdout: stdout.writable, stderr: stderr.writable },
    );

    expect(exitCode).toBe(2);
    expect(lines(stdout.text()).length).toBeGreaterThan(0);
    const diagnostic = JSON.parse(
      stderr.text().trim().split("\n").at(-1) ?? "{}",
    ) as {
      kind: string;
      tornRecord?: { file: string; line: number };
    };
    expect(diagnostic.kind).toBe("incomplete-hand");
    expect(diagnostic.tornRecord?.file).toBe(eventsPath);
  });

  it("exits 2 with just position 0 when the Hand's very first Command line is torn", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a", HAPPY_COMMANDS);
    const roomDir = path.join(recordingsDir, "room-a");
    const commandsPath = path.join(roomDir, "hand-0001.commands.jsonl");
    const eventsPath = path.join(roomDir, "hand-0001.events.jsonl");
    const firstLine = readFileSync(commandsPath, "utf8").split("\n")[0] ?? "";
    // Crash mid-write of the very first Command: nothing before it, nothing
    // after — commands.jsonl ends up shorter than even one complete line.
    truncateSync(commandsPath, Math.min(6, firstLine.length));
    truncateSync(eventsPath, 0);

    const stdout = collectingWritable();
    const stderr = collectingWritable();
    const exitCode = await runReplayCli([roomDir, "--hand", "1"], {
      stdout: stdout.writable,
      stderr: stderr.writable,
    });

    expect(exitCode).toBe(2);
    const records = lines(stdout.text()).map(
      (line) => JSON.parse(line) as { kind: string; position: number },
    );
    expect(records).toEqual([
      expect.objectContaining({ kind: "position", position: 0, event: null }),
    ]);
    const diagnostic = JSON.parse(stderr.text().trim()) as {
      kind: string;
      tornRecord?: { file: string; line: number };
      orphanedCommand?: number;
    };
    expect(diagnostic.kind).toBe("incomplete-hand");
    expect(diagnostic.tornRecord?.file).toBe(commandsPath);
    expect(diagnostic.orphanedCommand).toBeUndefined();
  });

  it("exits 2 naming the orphaned Command when events run short with no torn line", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a", [
      { type: "startHand", seatId: 0, seed: "cli-seed" },
      { type: "call", seatId: 0 },
    ]);
    const eventsPath = path.join(
      recordingsDir,
      "room-a",
      "hand-0001.events.jsonl",
    );
    const recordedLines = readFileSync(eventsPath, "utf8")
      .split("\n")
      .filter((line) => line !== "");
    // Drop the whole final Event line — a clean cut, not a torn one.
    const shortened = recordedLines.slice(0, -1).join("\n") + "\n";
    truncateSync(eventsPath, Buffer.byteLength(shortened, "utf8"));

    const stdout = collectingWritable();
    const stderr = collectingWritable();
    const exitCode = await runReplayCli(
      [path.join(recordingsDir, "room-a"), "--hand", "1"],
      { stdout: stdout.writable, stderr: stderr.writable },
    );

    expect(exitCode).toBe(2);
    expect(lines(stdout.text()).length).toBeGreaterThan(0);
    const diagnostic = JSON.parse(stderr.text().trim()) as {
      kind: string;
      orphanedCommand?: number;
      tornRecord?: unknown;
    };
    expect(diagnostic.kind).toBe("incomplete-hand");
    expect(diagnostic.orphanedCommand).toBe(1);
    expect(diagnostic.tornRecord).toBeUndefined();
  });

  it("exits 1 naming the first differing record when a persisted Command was tampered with", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a", HAPPY_COMMANDS);
    const commandsPath = path.join(
      recordingsDir,
      "room-a",
      "hand-0001.commands.jsonl",
    );
    const recordedLines = readFileSync(commandsPath, "utf8")
      .split("\n")
      .filter((line) => line !== "");
    const first = JSON.parse(recordedLines[0] ?? "{}") as {
      seed: string;
      v: number;
    };
    recordedLines[0] = JSON.stringify({ ...first, seed: "tampered-seed" });
    writeFileSync(commandsPath, recordedLines.join("\n") + "\n");

    const stdout = collectingWritable();
    const stderr = collectingWritable();
    const exitCode = await runReplayCli(
      [path.join(recordingsDir, "room-a"), "--hand", "1"],
      { stdout: stdout.writable, stderr: stderr.writable },
    );

    expect(exitCode).toBe(1);
    expect(stdout.text()).toBe("");
    const diagnostic = JSON.parse(stderr.text().trim()) as {
      kind: string;
      record: number;
    };
    expect(diagnostic.kind).toBe("record-mismatch");
    expect(diagnostic.record).toBe(0);
  });

  it("exits 1 with an invalid-context diagnostic when the Hand context's button is not among its seats", async () => {
    const recordingsDir = tempDir();
    await seedRoom(recordingsDir, "room-a", HAPPY_COMMANDS);
    const contextPath = path.join(
      recordingsDir,
      "room-a",
      "hand-0001.context.json",
    );
    const context = JSON.parse(readFileSync(contextPath, "utf8")) as Record<
      string,
      unknown
    >;
    writeFileSync(
      contextPath,
      JSON.stringify({ ...context, button: 99 }) + "\n",
    );

    const stdout = collectingWritable();
    const stderr = collectingWritable();
    const exitCode = await runReplayCli(
      [path.join(recordingsDir, "room-a"), "--hand", "1"],
      { stdout: stdout.writable, stderr: stderr.writable },
    );

    expect(exitCode).toBe(1);
    expect(stdout.text()).toBe("");
    const diagnostic = JSON.parse(stderr.text().trim()) as {
      kind: string;
      reason: string;
    };
    expect(diagnostic.kind).toBe("invalid-context");
    expect(diagnostic.reason).toBe("button-not-seated");
  });
});
