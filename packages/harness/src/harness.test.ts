import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable, Writable } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";
import { createInitialState, ENGINE_LOG_VERSION } from "@table-top-poker/engine";
import { runHarness } from "./harness.js";
import { HandLog, handLogPaths } from "./persistence.js";

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
      { type: "startHand", playerId: 0, seed: "seed-1" },
      { type: "call", playerId: 1 },
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
    const commands = [{ type: "call", playerId: 1 }];
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
      JSON.stringify({ type: "startHand", playerId: 0, seed: "seed-1" }) + "\n",
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
      JSON.stringify({ type: "startHand", playerId: 0, seed: "seed-1" }),
      JSON.stringify({ type: "call", playerId: 1 }),
      JSON.stringify({ type: "raise", playerId: 2 }),
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
      JSON.stringify({ type: "bogus", playerId: 0 }) + "\n",
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

  it("accepts a versioned-command line ({v, command}) the same as a bare command", async () => {
    const input = Readable.from([
      JSON.stringify({
        v: ENGINE_LOG_VERSION,
        command: { type: "startHand", playerId: 0, seed: "seed-1" },
      }) + "\n",
    ]);
    const { writable, lines } = collectingWritable();

    await runHarness({
      state: createInitialState([0, 1, 2]),
      input,
      output: writable,
    });

    const events = lines().map((line: string) => JSON.parse(line) as { type: string });
    expect(events[0]?.type).toBe("HandStarted");
  });

  describe("with logging enabled", () => {
    const dirs: string[] = [];

    function tempLogDir(): string {
      const dir = mkdtempSync(path.join(tmpdir(), "harness-log-"));
      dirs.push(dir);
      return dir;
    }

    afterEach(() => {
      for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
    });

    it("writes every command and event to the log without changing stdout", async () => {
      const logDir = tempLogDir();
      const log = new HandLog(logDir, "game-1", [0, 1, 2]);
      const commandLines = [
        JSON.stringify({ type: "startHand", playerId: 0, seed: "seed-1" }),
        JSON.stringify({ type: "call", playerId: 1 }),
      ];
      const input = Readable.from(commandLines.map((line) => line + "\n"));
      const { writable, lines } = collectingWritable();

      await runHarness({
        state: createInitialState([0, 1, 2]),
        input,
        output: writable,
        log,
      });

      const hand1 = handLogPaths(path.join(logDir, "game-1"), 1);
      const loggedCommands = readFileSync(hand1.commandsPath, { encoding: "utf8" })
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { command: { type: string } });
      expect(loggedCommands.map((r) => r.command.type)).toEqual(["startHand", "call"]);

      const loggedEvents = readFileSync(hand1.eventsPath, { encoding: "utf8" })
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { event: { type: string } });
      expect(loggedEvents.map((r) => r.event.type)).toEqual(
        lines().map((line) => (JSON.parse(line) as { type: string }).type),
      );
    });

    it("logs a Rejection to the event log too", async () => {
      const logDir = tempLogDir();
      const log = new HandLog(logDir, "game-1", [0, 1, 2]);
      const input = Readable.from([
        JSON.stringify({ type: "call", playerId: 1 }) + "\n",
      ]);
      const { writable } = collectingWritable();

      await runHarness({
        state: createInitialState([0, 1, 2]),
        input,
        output: writable,
        log,
      });

      const hand0 = handLogPaths(path.join(logDir, "game-1"), 0);
      const loggedEvents = readFileSync(hand0.eventsPath, { encoding: "utf8" })
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line) as { event: { type: string; reason?: string } });
      expect(loggedEvents).toHaveLength(1);
      expect(loggedEvents[0]?.event.type).toBe("Rejection");
      expect(loggedEvents[0]?.event.reason).toBe("hand-not-in-progress");
    });
  });
});
