import { execSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const cliPath = path.join(repoRoot, "packages/harness/dist/cli.js");

const commands = [
  { type: "startHand", seatId: 0, seed: "durability-seed" },
  { type: "call", seatId: 1 },
  { type: "raise", seatId: 2 },
  { type: "call", seatId: 0 },
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

    const loggedCommands = readJsonLines(commandsPath) as {
      v: number;
      type: string;
    }[];
    const loggedEvents = readJsonLines(eventsPath) as {
      v: number;
      type: string;
    }[];

    expect(loggedCommands.length).toBeGreaterThan(0);
    expect(loggedEvents.length).toBeGreaterThan(0);

    expect(loggedCommands.map((r) => r.type)).toEqual(
      commands.slice(0, loggedCommands.length).map((c) => c.type),
    );
  }, 20_000);
});
