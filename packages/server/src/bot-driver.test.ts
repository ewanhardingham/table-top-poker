import type { ServerMessage } from "@table-top-poker/protocol";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { buildApp } from "./app.js";
import { RoomStore } from "./rooms.js";

interface RunningApp {
  readonly app: FastifyInstance;
  readonly socket: WebSocket;
  readonly messages: ServerMessage[];
}

async function openTable(
  app: FastifyInstance,
  code: string,
): Promise<RunningApp> {
  await app.listen({ port: 0, host: "127.0.0.1" });
  const address = app.server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected a bound TCP address");
  }

  const socket = new WebSocket(
    `ws://127.0.0.1:${String(address.port)}/ws?room=${code}&role=table`,
  );
  const messages: ServerMessage[] = [];
  socket.on("message", (data: Buffer) => {
    messages.push(JSON.parse(data.toString()) as ServerMessage);
  });
  await new Promise<void>((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return { app, socket, messages };
}

async function closeTable(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return;
  await new Promise<void>((resolve) => {
    socket.once("close", resolve);
    socket.close();
  });
}

async function waitFor(
  predicate: () => boolean,
  message = "timed out waiting for bot driver",
): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(message);
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

async function waitForMessage(
  running: RunningApp,
  predicate: (message: ServerMessage) => boolean,
): Promise<void> {
  if (running.messages.some(predicate)) return;
  await new Promise<void>((resolve) => {
    const onMessage = (data: Buffer) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      if (!predicate(message)) return;
      running.socket.off("message", onMessage);
      resolve();
    };
    running.socket.on("message", onMessage);
  });
}

describe("bot driver", () => {
  let app: FastifyInstance | undefined;
  let socket: WebSocket | undefined;

  afterEach(async () => {
    if (socket) await closeTable(socket);
    if (app) await app.close();
    vi.useRealTimers();
    socket = undefined;
    app = undefined;
  });

  it("chains legal actions for an all-bot hand started by the table", async () => {
    vi.useFakeTimers();
    const rooms = new RoomStore();
    const room = rooms.create(3);
    const added = rooms.addBots(room, 3);
    expect(added.seats).toHaveLength(3);

    app = await buildApp({
      rooms,
      testMode: true,
      botRng: () => 0.5,
      botActionDelayMs: 1,
      pingIntervalMs: 100_000,
    });
    const running = await openTable(app, room.code);
    socket = running.socket;

    socket.send(JSON.stringify({ type: "startHand" }));
    for (let attempt = 0; attempt < 30; attempt++) {
      if (room.engine?.hand?.status === "complete") break;
      await vi.advanceTimersByTimeAsync(1);
    }
    await waitForMessage(
      running,
      (message) =>
        message.type === "hand-update" && message.event.type === "HandComplete",
    );

    const actions = running.messages.filter(
      (message) =>
        message.type === "hand-update" && message.event.type === "ActionTaken",
    );
    expect(actions.length).toBeGreaterThan(1);
    expect(running.messages).not.toContainEqual(
      expect.objectContaining({ type: "command-rejected" }),
    );
    expect(running.messages).toContainEqual(
      expect.objectContaining({
        type: "hand-update",
        event: { type: "HandComplete" },
      }),
    );
  });

  it("rolls bot sit-out/in state at the completed-hand boundary", async () => {
    const rooms = new RoomStore();
    const room = rooms.create(3);
    rooms.addBots(room, 3);
    let rngCalls = 0;
    const botRng = () => {
      const value =
        rngCalls < 12
          ? 0.5
          : rngCalls < 15
            ? ([0, 0.5, 0.5][rngCalls - 12] ?? 0.5)
            : rngCalls < 23
              ? 0.5
              : ([0, 0.5, 0.5][rngCalls - 23] ?? 0.5);
      rngCalls++;
      return value;
    };

    app = await buildApp({
      rooms,
      testMode: true,
      botRng,
      botActionDelayMs: 1,
      pingIntervalMs: 100_000,
    });
    const running = await openTable(app, room.code);
    socket = running.socket;

    socket.send(JSON.stringify({ type: "startHand" }));
    await waitFor(() => room.engine?.hand?.status === "complete");
    expect(room.seats[0]).toMatchObject({
      claimed: true,
      bot: true,
      sittingOut: true,
    });

    socket.send(JSON.stringify({ type: "nextHand" }));
    await waitFor(() => rngCalls >= 26 && room.seats[0]?.sittingOut === false);
    expect(room.engine?.seats).toEqual([1, 2]);
    expect(room.seats[0]).toMatchObject({
      claimed: true,
      bot: true,
      sittingOut: false,
    });
  });

  it("is inert when test mode is disabled", async () => {
    const rooms = new RoomStore();
    const room = rooms.create(2);
    rooms.addBots(room, 2);
    let rngCalls = 0;

    app = await buildApp({
      rooms,
      botRng: () => {
        rngCalls++;
        return 0.5;
      },
      botActionDelayMs: 1,
      pingIntervalMs: 100_000,
    });
    const running = await openTable(app, room.code);
    socket = running.socket;

    socket.send(JSON.stringify({ type: "startHand" }));
    await waitFor(() => room.engine?.hand?.status === "betting");
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(rngCalls).toBe(0);
    expect(room.engine?.hand?.status).toBe("betting");
    expect(running.messages).not.toContainEqual(
      expect.objectContaining({
        type: "hand-update",
        event: { type: "ActionTaken" },
      }),
    );
  });
});
