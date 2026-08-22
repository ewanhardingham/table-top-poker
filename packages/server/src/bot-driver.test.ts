import type { ServerMessage } from "@table-top-poker/protocol";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { DirectoryRecordings } from "@table-top-poker/recording";
import { createMemoryFileSystem } from "@table-top-poker/recording/testing";
import { buildApp } from "./app.js";
import { RoomStore } from "./rooms.js";

const RECORDINGS_ROOT = "/recordings";

function testRecordings(): DirectoryRecordings {
  return new DirectoryRecordings(RECORDINGS_ROOT, createMemoryFileSystem());
}

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
  startAt = 0,
): Promise<void> {
  if (running.messages.slice(startAt).some(predicate)) return;
  await new Promise<void>((resolve) => {
    const onMessage = (data: Buffer) => {
      const message = JSON.parse(data.toString()) as ServerMessage;
      const messageIndex = running.messages.length - 1;
      if (messageIndex < startAt || !predicate(message)) return;
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
    socket = undefined;
    app = undefined;
  });

  it("chains legal actions for an all-bot hand started by the table", async () => {
    const rooms = new RoomStore();
    const room = rooms.create(3);
    const added = rooms.addBots(room, 3);
    expect(added.seats).toHaveLength(3);

    app = await buildApp({
      recordings: testRecordings(),
      rooms,
      testMode: true,
      botRng: () => 0.5,
      botActionDelayMs: 1,
      pingIntervalMs: 100_000,
    });
    const running = await openTable(app, room.code);
    socket = running.socket;

    socket.send(JSON.stringify({ type: "startHand" }));
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

  it("resolves an all-bot showing window rather than wedging the room", async () => {
    const rooms = new RoomStore();
    const room = rooms.create(3);
    rooms.addBots(room, 3);

    app = await buildApp({
      recordings: testRecordings(),
      rooms,
      testMode: true,
      // Never rolls a muck: the compelled head shows and the rest follow.
      botRng: () => 0.1,
      botActionDelayMs: 1,
      pingIntervalMs: 100_000,
      showdownClockMs: 100_000,
    });
    const running = await openTable(app, room.code);
    socket = running.socket;

    socket.send(JSON.stringify({ type: "startHand" }));
    await waitFor(
      () => rooms.get(room.code)?.engine?.hand?.status === "complete",
      "hand never completed",
    );

    const hand = rooms.get(room.code)?.engine?.hand;
    if (hand?.status !== "complete")
      throw new Error("expected a complete hand");
    expect(hand.reason).toBe("showdown");

    await waitForMessage(
      running,
      (message) =>
        message.type === "hand-update" &&
        message.event.type === "WinnersDeclared",
    );
    expect(rooms.showdownActor(room.code)).toBeUndefined();
    expect(running.messages).not.toContainEqual(
      expect.objectContaining({ type: "command-rejected" }),
    );
  });

  it("keeps a two-seat floor, reports cadence over WS, and deals a waiting bot next hand", async () => {
    app = await buildApp({
      recordings: testRecordings(),
      testMode: true,
      botRng: () => 0,
      botActionDelayMs: 50,
      pingIntervalMs: 100_000,
    });
    const created = await app.inject({
      method: "POST",
      url: "/rooms",
      payload: { seatCount: 4 },
    });
    const code = created.json<{ readonly code: string }>().code;
    const added = await app.inject({
      method: "POST",
      url: `/rooms/${code}/bots`,
      payload: { count: 3 },
    });
    expect(added.json()).toEqual({ joined: 3 });

    const running = await openTable(app, code);
    socket = running.socket;
    socket.send(JSON.stringify({ type: "startHand" }));

    await waitForMessage(
      running,
      (message) =>
        message.type === "hand-update" && message.event.type === "HandComplete",
    );
    await waitForMessage(
      running,
      (message) =>
        message.type === "room-view" &&
        message.view.seats.some(
          (seat) => seat.sittingOutReason === "voluntary",
        ),
    );
    const firstCadenceView = [...running.messages]
      .reverse()
      .find((message) => message.type === "room-view");
    if (firstCadenceView?.type !== "room-view") {
      throw new Error("expected a cadence room view");
    }
    expect(
      firstCadenceView.view.seats.filter(
        (seat) => seat.claimed && !seat.sittingOut,
      ),
    ).toHaveLength(2);
    expect(
      firstCadenceView.view.seats.some(
        (seat) => seat.sittingOutReason === "voluntary",
      ),
    ).toBe(true);

    const firstNextHandMessage = running.messages.length;
    socket.send(JSON.stringify({ type: "nextHand" }));
    await waitForMessage(
      running,
      (message) =>
        message.type === "hand-update" && message.event.type === "HandStarted",
      firstNextHandMessage,
    );

    const claimedMidHand = await app.inject({
      method: "POST",
      url: `/rooms/${code}/bots`,
      payload: { count: 1 },
    });
    expect(claimedMidHand.json()).toEqual({ joined: 1 });
    await waitForMessage(
      running,
      (message) =>
        message.type === "room-view" &&
        message.view.seats.some(
          (seat) => seat.sittingOutReason === "waiting-for-next-hand",
        ),
    );

    const secondCadenceMessage = running.messages.length;
    await waitForMessage(
      running,
      (message) =>
        message.type === "hand-update" && message.event.type === "HandComplete",
      firstNextHandMessage,
    );
    await waitForMessage(
      running,
      (message) =>
        message.type === "room-view" &&
        message.view.seats.some(
          (seat) => seat.sittingOutReason === "waiting-for-next-hand",
        ),
      secondCadenceMessage,
    );
    const secondNextHandMessage = running.messages.length;
    socket.send(JSON.stringify({ type: "nextHand" }));
    await waitForMessage(
      running,
      (message) =>
        message.type === "hand-update" && message.event.type === "HandStarted",
      secondNextHandMessage,
    );
    await waitForMessage(
      running,
      (message) => message.type === "room-view",
      secondNextHandMessage,
    );
    const nextDealView = [...running.messages]
      .slice(secondNextHandMessage)
      .find((message) => message.type === "room-view");
    if (nextDealView?.type !== "room-view") {
      throw new Error("expected room view after next hand");
    }
    expect(
      nextDealView.view.seats.some(
        (seat) => seat.sittingOutReason === "waiting-for-next-hand",
      ),
    ).toBe(false);
  });

  it("is inert when test mode is disabled", async () => {
    const rooms = new RoomStore();
    const room = rooms.create(2);
    rooms.addBots(room, 2);
    let rngCalls = 0;

    app = await buildApp({
      recordings: testRecordings(),
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
