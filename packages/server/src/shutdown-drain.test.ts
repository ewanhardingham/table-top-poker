import { execFileSync, spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import WebSocket from "ws";
import type { PlayerView, ActionType } from "@table-top-poker/engine";
import type { ServerMessage } from "@table-top-poker/protocol";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const serverEntry = path.join(repoRoot, "packages/server/dist/server.js");
const harnessCli = path.join(repoRoot, "packages/harness/dist/cli.js");

interface RoomCreatedBody {
  readonly code: string;
}

interface SeatClaimedBody {
  readonly seatId: number;
  readonly token: string;
}

async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (address === null || typeof address === "string") {
        reject(new Error("expected a bound TCP address"));
        return;
      }
      const port = address.port;
      probe.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
    probe.on("error", reject);
  });
}

async function waitFor(
  condition: () => boolean,
  timeoutMs = 5_000,
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (condition()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("timed out waiting for the condition");
}

async function waitUntilServing(baseUrl: string): Promise<void> {
  const start = Date.now();
  for (;;) {
    try {
      const response = await fetch(`${baseUrl}/config`);
      if (response.ok) return;
    } catch {
      // server not accepting connections yet
    }
    if (Date.now() - start > 10_000) {
      throw new Error("server never became ready");
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

interface Connection {
  readonly socket: WebSocket;
  readonly messages: ServerMessage[];
}

function connect(baseUrl: string, query: string): Connection {
  const socket = new WebSocket(`${baseUrl.replace("http", "ws")}/ws?${query}`);
  const messages: ServerMessage[] = [];
  socket.on("message", (data: Buffer) => {
    messages.push(JSON.parse(data.toString()) as ServerMessage);
  });
  return { socket, messages };
}

async function waitForOpen(connection: Connection): Promise<void> {
  if (connection.socket.readyState === WebSocket.OPEN) return;
  await new Promise<void>((resolve, reject) => {
    connection.socket.once("open", () => {
      resolve();
    });
    connection.socket.once("error", reject);
  });
}

/** The one seat whose own view currently carries a non-empty legal-action list. */
function actingSeat(
  seats: readonly Connection[],
): { seat: Connection; action: ActionType } | undefined {
  for (const seat of seats) {
    const view = [...seat.messages]
      .reverse()
      .map((message) =>
        message.type === "hand-update" ? message.view : undefined,
      )
      .find((candidate): candidate is PlayerView => candidate !== undefined);
    if (view?.phase !== "betting") continue;
    const legal = view.legalActions;
    if (legal.length === 0) continue;
    const action = legal.includes("call")
      ? "call"
      : legal.includes("check")
        ? "check"
        : legal[0];
    if (action === undefined) continue;
    return { seat, action };
  }
  return undefined;
}

function actionsTaken(table: Connection): number {
  return table.messages.filter(
    (message) =>
      message.type === "hand-update" && message.event.type === "ActionTaken",
  ).length;
}

/**
 * Plays two actions, resolving once the table has broadcast confirmation of
 * both — `actingSeat` reads each seat's own last-known view, which lags the
 * server by a network round trip, so picking the next actor before that
 * catches up finds the seat that *just* acted rather than the one now on
 * the clock.
 */
async function playOneRound(
  table: Connection,
  seats: readonly Connection[],
): Promise<void> {
  table.socket.send(JSON.stringify({ type: "startHand" }));
  for (let round = 0; round < 2; round += 1) {
    let found: { seat: Connection; action: ActionType } | undefined;
    await waitFor(() => {
      found = actingSeat(seats);
      return found !== undefined;
    });
    if (found === undefined) throw new Error("expected an acting seat");
    const confirmedBefore = actionsTaken(table);
    found.seat.socket.send(JSON.stringify({ type: found.action }));
    await waitFor(() => actionsTaken(table) > confirmedBefore);
  }
}

describe("server shutdown drains the recording", () => {
  beforeAll(() => {
    execFileSync(
      "npm",
      [
        "run",
        "build",
        "-w",
        "@table-top-poker/harness",
        "-w",
        "@table-top-poker/server",
      ],
      { cwd: repoRoot, stdio: "pipe" },
    );
  }, 120_000);

  const dirs: string[] = [];
  const children: ChildProcess[] = [];

  afterEach(() => {
    for (const child of children.splice(0)) {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
      }
    }
    for (const dir of dirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it.each(["SIGINT", "SIGTERM"] as const)(
    "exits 0 on %s, leaving a recording that replays cleanly",
    async (signal) => {
      const recordingsDir = mkdtempSync(path.join(tmpdir(), "shutdown-"));
      dirs.push(recordingsDir);
      const port = await getFreePort();
      const baseUrl = `http://127.0.0.1:${String(port)}`;

      const child = spawn(process.execPath, [serverEntry], {
        cwd: repoRoot,
        env: {
          ...process.env,
          PORT: String(port),
          HOST: "127.0.0.1",
          RECORDINGS_DIR: recordingsDir,
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      children.push(child);
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });

      await waitUntilServing(baseUrl);

      const created = await fetch(`${baseUrl}/rooms`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ seatCount: 2 }),
      });
      const { code } = (await created.json()) as RoomCreatedBody;

      const claims = await Promise.all(
        [0, 1].map(async (seatId) => {
          const response = await fetch(
            `${baseUrl}/rooms/${code}/seats/${String(seatId)}/claim`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ displayName: `P${String(seatId)}` }),
            },
          );
          return (await response.json()) as SeatClaimedBody;
        }),
      );

      const table = connect(baseUrl, `room=${code}&role=table`);
      const seats = claims.map((claim) =>
        connect(
          baseUrl,
          `room=${code}&seat=${String(claim.seatId)}&token=${claim.token}`,
        ),
      );
      await Promise.all([table, ...seats].map(waitForOpen));

      await playOneRound(table, seats);

      for (const connection of [table, ...seats]) connection.socket.close();

      const exit = new Promise<{
        code: number | null;
        signal: NodeJS.Signals | null;
      }>((resolve) => {
        child.once("exit", (exitCode, exitSignal) => {
          resolve({ code: exitCode, signal: exitSignal });
        });
      });
      child.kill(signal);
      const result = await exit;

      expect(result.code, stderr).toBe(0);

      const roomDirs = readdirSync(recordingsDir);
      expect(roomDirs).toHaveLength(1);
      const roomId = roomDirs[0];
      if (roomId === undefined) throw new Error("expected a recorded room");

      const commandsPath = path.join(
        recordingsDir,
        roomId,
        "hand-0001.commands.jsonl",
      );
      const commandLines = readFileSync(commandsPath, "utf8")
        .split("\n")
        .filter((line) => line !== "");
      expect(commandLines.length).toBeGreaterThanOrEqual(3);
      for (const line of commandLines) {
        expect(() => {
          JSON.parse(line);
        }).not.toThrow();
      }

      const replay = spawn(
        process.execPath,
        [
          harnessCli,
          "replay",
          roomId,
          "--hand",
          "1",
          "--recordings-dir",
          recordingsDir,
        ],
        { stdio: ["ignore", "pipe", "pipe"] },
      );
      children.push(replay);
      let replayStdout = "";
      let replayStderr = "";
      replay.stdout.on("data", (chunk: Buffer) => {
        replayStdout += chunk.toString("utf8");
      });
      replay.stderr.on("data", (chunk: Buffer) => {
        replayStderr += chunk.toString("utf8");
      });
      const replayExit = await new Promise<number | null>((resolve) => {
        replay.once("exit", (replayExitCode) => {
          resolve(replayExitCode);
        });
      });

      expect(replayExit, replayStderr).toBe(0);
      expect(replayStderr).not.toContain("incomplete-hand");
      expect(replayStdout.trim().split("\n").length).toBeGreaterThan(0);
    },
    30_000,
  );
});
