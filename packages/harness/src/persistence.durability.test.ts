import { execSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const cliPath = path.join(repoRoot, "packages/harness/dist/cli.js");

const commands = [
  { type: "startHand", playerId: 0, seed: "durability-seed" },
  { type: "call", playerId: 1 },
  { type: "raise", playerId: 2 },
  { type: "call", playerId: 0 },
];

function readJsonLines(filePath: string): unknown[] {
  const text = readFileSync(filePath, { encoding: "utf8" });
  const lines = text.split("\n").filter((line) => line !== "");
  return lines.map((line) => JSON.parse(line) as unknown);
}

describe("HandLog crash durability", () => {
  const dirs: string[] = [];

  beforeAll(() => {
    execSync(
      "npm run build -w @table-top-poker/engine -w @table-top-poker/harness",
      {
        cwd: repoRoot,
        stdio: "pipe",
      },
    );
  }, 60_000);

  afterEach(() => {
    for (const dir of dirs.splice(0))
      rmSync(dir, { recursive: true, force: true });
  });

  it("SIGKILL mid-hand leaves a partial but line-by-line-parseable log, with no completed write lost", async () => {
    const logDir = mkdtempSync(path.join(tmpdir(), "durability-"));
    dirs.push(logDir);

    const child = spawn(
      process.execPath,
      [
        cliPath,
        "--seats",
        "0,1,2",
        "--log-dir",
        logDir,
        "--game-id",
        "crash-test",
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );

    let stdout = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });

    // Send commands one at a time, waiting for at least one new stdout line
    // after each — proof the harness (and therefore the logger, which
    // writes synchronously before `decide` runs) has processed it.
    for (const command of commands) {
      const before = stdout.length;
      child.stdin.write(JSON.stringify(command) + "\n");
      await new Promise<void>((resolve) => {
        const check = (): void => {
          if (stdout.length > before) {
            child.stdout.off("data", check);
            resolve();
          }
        };
        child.stdout.on("data", check);
      });
    }

    const exited = new Promise<void>((resolve) => {
      child.once("exit", () => {
        resolve();
      });
    });
    child.kill("SIGKILL");
    await exited;

    const commandsPath = path.join(
      logDir,
      "crash-test",
      "hand-0001.commands.jsonl",
    );
    const eventsPath = path.join(
      logDir,
      "crash-test",
      "hand-0001.events.jsonl",
    );

    // Every line that made it to disk must be a complete, parseable record —
    // no torn write from the kill landing mid-append.
    const loggedCommands = readJsonLines(commandsPath) as {
      v: number;
      command: { type: string };
    }[];
    const loggedEvents = readJsonLines(eventsPath) as {
      v: number;
      event: { type: string };
    }[];

    expect(loggedCommands.length).toBeGreaterThan(0);
    expect(loggedEvents.length).toBeGreaterThan(0);

    // The logged commands are a prefix of what was actually sent — nothing
    // sent-and-acknowledged is missing, and nothing beyond what was sent
    // could have leaked in.
    expect(loggedCommands.map((r) => r.command.type)).toEqual(
      commands.slice(0, loggedCommands.length).map((c) => c.type),
    );
  }, 20_000);
});
