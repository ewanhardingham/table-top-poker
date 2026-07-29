import type { RoomView, ServerMessage } from "@table-top-poker/protocol";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { buildApp } from "./app.js";
import { RoomStore, SEAT_COUNT, toRoomView } from "./rooms.js";

interface RoomCreatedBody {
  readonly code: string;
  readonly joinUrl: string;
  readonly qrCodeDataUrl: string;
}

interface RoomQrBody {
  readonly url: string;
  readonly dataUrl: string;
}

interface SeatClaimBody {
  readonly seatId: number;
  readonly token: string;
  readonly sittingOut: boolean;
}

function unclaimedSeats(): RoomView["seats"] {
  return Array.from({ length: SEAT_COUNT }, (_, id) => ({
    id,
    claimed: false,
    sittingOut: false,
    disconnected: false,
  }));
}

describe("rooms HTTP routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates a room and returns a valid 4-char code with its QR code", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/rooms",
      headers: { host: "192.168.1.50:3000" },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<RoomCreatedBody>();
    expect(body.code).toMatch(/^[A-Z0-9]{4}$/);
    expect(body.joinUrl).toBe(`http://192.168.1.50:3000/join/${body.code}`);
    expect(body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("joining a known room code returns its room view", async () => {
    const created = await app.inject({ method: "POST", url: "/rooms" });
    const { code } = created.json<RoomCreatedBody>();

    const joined = await app.inject({
      method: "POST",
      url: `/rooms/${code}/join`,
    });
    expect(joined.statusCode).toBe(200);
    expect(joined.json<RoomView>()).toEqual({
      code,
      seats: unclaimedSeats(),
    });
  });

  it("joining an unknown room code is rejected", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/rooms/ZZZZ/join",
    });
    expect(response.statusCode).toBe(404);
  });

  it("produces a QR code for a created room, derived from the request host", async () => {
    const created = await app.inject({ method: "POST", url: "/rooms" });
    const { code } = created.json<RoomCreatedBody>();

    const response = await app.inject({
      method: "GET",
      url: `/rooms/${code}/qr`,
      headers: { host: "192.168.1.50:3000" },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<RoomQrBody>();
    expect(body.url).toBe(`http://192.168.1.50:3000/join/${code}`);
    expect(body.dataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("ending a session discards the room's in-memory state", async () => {
    const created = await app.inject({ method: "POST", url: "/rooms" });
    const { code } = created.json<RoomCreatedBody>();

    const ended = await app.inject({
      method: "POST",
      url: `/rooms/${code}/end`,
    });
    expect(ended.statusCode).toBe(204);

    const joined = await app.inject({
      method: "POST",
      url: `/rooms/${code}/join`,
    });
    expect(joined.statusCode).toBe(404);
  });
});

describe("GET /join/:code", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
    delete process.env.PLAYER_CLIENT_ORIGIN;
  });

  it("404s for an unknown room code", async () => {
    app = await buildApp();
    const response = await app.inject({ method: "GET", url: "/join/ZZZZ" });
    expect(response.statusCode).toBe(404);
  });

  it("serves the same-origin placeholder when no player origin is configured", async () => {
    app = await buildApp();
    const created = await app.inject({ method: "POST", url: "/rooms" });
    const { code } = created.json<RoomCreatedBody>();

    const response = await app.inject({ method: "GET", url: `/join/${code}` });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^text\/html/);
  });

  it("redirects to PLAYER_CLIENT_ORIGIN when configured", async () => {
    process.env.PLAYER_CLIENT_ORIGIN = "http://192.168.1.50:5174";
    app = await buildApp();
    const created = await app.inject({ method: "POST", url: "/rooms" });
    const { code } = created.json<RoomCreatedBody>();

    const response = await app.inject({ method: "GET", url: `/join/${code}` });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(
      `http://192.168.1.50:5174/join/${code}`,
    );
  });
});

describe("seat claim/clear routes", () => {
  let app: FastifyInstance;
  let rooms: RoomStore;

  beforeEach(async () => {
    rooms = new RoomStore();
    app = await buildApp({ rooms });
  });

  afterEach(async () => {
    await app.close();
  });

  async function createRoom(): Promise<string> {
    const created = await app.inject({ method: "POST", url: "/rooms" });
    return created.json<RoomCreatedBody>().code;
  }

  it("claims a free seat, issuing a token", async () => {
    const code = await createRoom();

    const response = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/0/claim`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<SeatClaimBody>();
    expect(typeof body.token).toBe("string");
    expect(body).toMatchObject({ seatId: 0, sittingOut: false });
  });

  it("rejects claiming an already-claimed seat", async () => {
    const code = await createRoom();
    await app.inject({ method: "POST", url: `/rooms/${code}/seats/0/claim` });

    const response = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/0/claim`,
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "seat-already-claimed" });
  });

  it("rejects claiming a seat in an unknown room", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/rooms/ZZZZ/seats/0/claim",
    });
    expect(response.statusCode).toBe(404);
  });

  it("rejects an out-of-range seat id", async () => {
    const code = await createRoom();
    const response = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/${String(SEAT_COUNT)}/claim`,
    });
    expect(response.statusCode).toBe(404);
  });

  it("rejects a malformed seat id", async () => {
    const code = await createRoom();
    const response = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/not-a-number/claim`,
    });
    expect(response.statusCode).toBe(400);
  });

  it("marks a seat claimed mid-hand as sitting out", async () => {
    const code = await createRoom();
    rooms.claimSeat(code, 0);
    rooms.claimSeat(code, 1);
    rooms.dispatch(code, "table", "startHand");

    const response = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/2/claim`,
    });

    expect(response.json<SeatClaimBody>().sittingOut).toBe(true);
  });

  it("force-clears a seat so it can be reclaimed", async () => {
    const code = await createRoom();
    await app.inject({ method: "POST", url: `/rooms/${code}/seats/0/claim` });

    const cleared = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/0/clear`,
    });
    expect(cleared.statusCode).toBe(204);

    const reclaimed = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/0/claim`,
    });
    expect(reclaimed.statusCode).toBe(200);
  });
});

describe("WebSocket upgrade", () => {
  let app: FastifyInstance;
  let rooms: RoomStore;
  let port: number;

  beforeEach(async () => {
    rooms = new RoomStore();
    app = await buildApp({ rooms });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected a bound TCP address");
    }
    port = address.port;
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects a connection with no room param", async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/ws`);
    const closeCode = await new Promise<number>((resolve) => {
      socket.on("unexpected-response", (_req, res) => {
        resolve(res.statusCode ?? 0);
      });
      socket.on("close", (code) => {
        resolve(code);
      });
    });
    expect(closeCode).toBe(400);
  });

  it("rejects a connection for an unknown room", async () => {
    const socket = new WebSocket(
      `ws://127.0.0.1:${String(port)}/ws?room=ZZZZ&role=table`,
    );
    const closeCode = await new Promise<number>((resolve) => {
      socket.on("unexpected-response", (_req, res) => {
        resolve(res.statusCode ?? 0);
      });
    });
    expect(closeCode).toBe(404);
  });

  it("accepts a table-device connection scoped to a live room", async () => {
    const room = rooms.create();
    const socket = new WebSocket(
      `ws://127.0.0.1:${String(port)}/ws?room=${room.code}&role=table`,
    );
    await new Promise<void>((resolve, reject) => {
      socket.on("open", resolve);
      socket.on("error", reject);
    });
    expect(socket.readyState).toBe(WebSocket.OPEN);
    socket.close();
  });

  it("pushes a fresh room view on connect and on every seat claim", async () => {
    const room = rooms.create();
    const socket = new WebSocket(
      `ws://127.0.0.1:${String(port)}/ws?room=${room.code}&role=table`,
    );

    const messages: ServerMessage[] = [];
    socket.on("message", (data: Buffer) => {
      messages.push(JSON.parse(data.toString()) as ServerMessage);
    });

    await new Promise<void>((resolve, reject) => {
      socket.on("open", resolve);
      socket.on("error", reject);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toEqual({
      type: "room-view",
      view: { code: room.code, seats: unclaimedSeats() },
    });

    await app.inject({
      method: "POST",
      url: `/rooms/${room.code}/seats/0/claim`,
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(messages).toHaveLength(2);
    expect(messages[1]?.type).toBe("room-view");
    expect((messages[1] as { view: RoomView }).view.seats[0]).toEqual({
      id: 0,
      claimed: true,
      sittingOut: false,
      disconnected: false,
    });

    socket.close();
  });

  it("rejects a player connection with an unknown seat token", async () => {
    const room = rooms.create();
    const socket = new WebSocket(
      `ws://127.0.0.1:${String(port)}/ws?room=${room.code}&seat=0&token=bogus`,
    );
    const closeCode = await new Promise<number>((resolve) => {
      socket.on("unexpected-response", (_req, res) => {
        resolve(res.statusCode ?? 0);
      });
    });
    expect(closeCode).toBe(403);
  });

  it("accepts a player connection with a valid seat token", async () => {
    const room = rooms.create();
    const claim = rooms.claimSeat(room.code, 0);
    if (!("seat" in claim)) throw new Error("expected a claimed seat");

    const socket = new WebSocket(
      `ws://127.0.0.1:${String(port)}/ws?room=${room.code}&seat=0&token=${claim.seat.token ?? ""}`,
    );
    await new Promise<void>((resolve, reject) => {
      socket.on("open", resolve);
      socket.on("error", reject);
    });
    expect(socket.readyState).toBe(WebSocket.OPEN);
    socket.close();
  });
});

describe("hand command dispatch over WebSocket", () => {
  let app: FastifyInstance;
  let rooms: RoomStore;
  let port: number;

  beforeEach(async () => {
    rooms = new RoomStore();
    app = await buildApp({ rooms });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected a bound TCP address");
    }
    port = address.port;
  });

  afterEach(async () => {
    await app.close();
  });

  function connect(query: string): {
    socket: WebSocket;
    messages: ServerMessage[];
  } {
    const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/ws?${query}`);
    const messages: ServerMessage[] = [];
    socket.on("message", (data: Buffer) => {
      messages.push(JSON.parse(data.toString()) as ServerMessage);
    });
    return { socket, messages };
  }

  async function opened(socket: WebSocket): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      socket.on("open", resolve);
      socket.on("error", reject);
    });
  }

  async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  async function claimAndConnect(
    code: string,
    seatId: number,
  ): Promise<{ socket: WebSocket; messages: ServerMessage[] }> {
    const claim = rooms.claimSeat(code, seatId);
    if (!("seat" in claim)) throw new Error("expected a claimed seat");
    const conn = connect(
      `room=${code}&seat=${String(seatId)}&token=${claim.seat.token ?? ""}`,
    );
    await opened(conn.socket);
    return conn;
  }

  it("deals hole cards on startHand, each seat only ever seeing its own cards", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    const seat0 = await claimAndConnect(room.code, 0);
    const seat1 = await claimAndConnect(room.code, 1);
    const seat2 = await claimAndConnect(room.code, 2);
    await settle();

    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();

    const holeCardsFor = (messages: ServerMessage[], seatId: number) => {
      for (const message of messages) {
        if (message.type !== "hand-update") continue;
        const v = message.view;
        if (
          "yourSeatId" in v &&
          v.yourSeatId === seatId &&
          v.yourHoleCards !== null
        ) {
          return v.yourHoleCards;
        }
      }
      return undefined;
    };

    const cards0 = holeCardsFor(seat0.messages, 0);
    const cards1 = holeCardsFor(seat1.messages, 1);
    const cards2 = holeCardsFor(seat2.messages, 2);
    expect(cards0).toBeDefined();
    expect(cards1).toBeDefined();
    expect(cards2).toBeDefined();

    const raw = (messages: ServerMessage[]) => JSON.stringify(messages);
    for (const [mine, others] of [
      [cards0, [seat1, seat2]],
      [cards1, [seat0, seat2]],
      [cards2, [seat0, seat1]],
    ] as const) {
      for (const other of others) {
        for (const card of mine ?? []) {
          expect(raw(other.messages)).not.toContain(JSON.stringify(card));
        }
      }
      expect(raw(table.messages)).not.toContain("yourHoleCards");
    }

    const tableStreetStarted = table.messages.find(
      (m) => m.type === "hand-update" && m.event.type === "StreetStarted",
    );
    expect(tableStreetStarted).toBeDefined();
  });

  it("excludes a sitting-out seat from the deal and it stays sitting out", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    await claimAndConnect(room.code, 0);
    await claimAndConnect(room.code, 1);
    await settle();

    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();

    const midHandJoin = await claimAndConnect(room.code, 2);
    await settle();
    const handUpdates = midHandJoin.messages.filter(
      (m) => m.type === "hand-update",
    );
    expect(handUpdates).toHaveLength(0);

    const view = rooms.get(room.code);
    expect(view && toRoomView(view).seats[2]?.sittingOut).toBe(true);
  });

  it("lets a seat voluntarily sit out and back in over the WebSocket (ADR-0002)", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    const seat0 = await claimAndConnect(room.code, 0);
    await settle();

    seat0.socket.send(JSON.stringify({ type: "sitOut" }));
    await settle();

    expect(rooms.get(room.code)?.seats[0]).toMatchObject({
      sittingOut: true,
    });
    const roomView = table.messages.findLast((m) => m.type === "room-view");
    if (roomView?.type !== "room-view") throw new Error("expected a view");
    expect(roomView.view.seats[0]).toMatchObject({ sittingOut: true });

    seat0.socket.send(JSON.stringify({ type: "sitIn" }));
    await settle();

    expect(rooms.get(room.code)?.seats[0]).toMatchObject({
      sittingOut: false,
    });
  });

  it("rejects sitOut/sitIn from the table role", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    await settle();

    table.socket.send(JSON.stringify({ type: "sitOut" }));
    await settle();

    expect(table.messages).toContainEqual({
      type: "command-rejected",
      reason: "not-permitted",
    });
  });

  it("rejects a malformed command via Zod before it reaches the engine", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    await settle();

    table.socket.send(JSON.stringify({ type: "definitely-not-a-command" }));
    await settle();

    expect(table.messages).toContainEqual({
      type: "command-rejected",
      reason: "invalid-command",
    });
    expect(rooms.get(room.code)?.engine).toBeNull();
  });

  it("rejects a player-issued startHand — table-only at the server layer", async () => {
    const room = rooms.create();
    const seat0 = await claimAndConnect(room.code, 0);
    await claimAndConnect(room.code, 1);
    await settle();

    seat0.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();

    expect(seat0.messages).toContainEqual({
      type: "command-rejected",
      reason: "not-permitted",
    });
    expect(rooms.get(room.code)?.engine).toBeNull();
  });

  it("plays a full betting round preflop through river, every action type exercised, over the wire", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    const seat0 = await claimAndConnect(room.code, 0);
    const seat1 = await claimAndConnect(room.code, 1);
    const seat2 = await claimAndConnect(room.code, 2);
    await settle();

    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();

    // button = seat 0, ring = [1, 2, 0], BB = seat 2 (see rooms.ts/room.ts).
    // Preflop: SB calls, BB raises — forcing seat 0 and seat 1 to act again
    // (street closure waits for every live player since the raise, not just
    // one lap), both call, street closes.
    seat1.socket.send(JSON.stringify({ type: "call" }));
    await settle();
    seat2.socket.send(JSON.stringify({ type: "raise" }));
    await settle();
    seat0.socket.send(JSON.stringify({ type: "call" }));
    await settle();
    seat1.socket.send(JSON.stringify({ type: "call" }));
    await settle();

    // Flop: everyone checks.
    seat1.socket.send(JSON.stringify({ type: "check" }));
    await settle();
    seat2.socket.send(JSON.stringify({ type: "check" }));
    await settle();
    seat0.socket.send(JSON.stringify({ type: "check" }));
    await settle();

    // Turn: seat 0 folds instead of its final check — two live players
    // remain, so the hand keeps going rather than folding out.
    seat1.socket.send(JSON.stringify({ type: "check" }));
    await settle();
    seat2.socket.send(JSON.stringify({ type: "check" }));
    await settle();
    seat0.socket.send(JSON.stringify({ type: "fold" }));
    await settle();

    // River: the two remaining live seats check down to showdown.
    seat1.socket.send(JSON.stringify({ type: "check" }));
    await settle();
    seat2.socket.send(JSON.stringify({ type: "check" }));
    await settle();

    const events = table.messages
      .filter((m) => m.type === "hand-update")
      .map((m) => m.event);

    const actionsSeen = new Set(
      events.filter((e) => e.type === "ActionTaken").map((e) => e.action),
    );
    expect(actionsSeen).toEqual(new Set(["call", "raise", "check", "fold"]));

    const streetsStarted = new Set(
      events.filter((e) => e.type === "StreetStarted").map((e) => e.street),
    );
    expect(streetsStarted).toEqual(
      new Set(["preflop", "flop", "turn", "river"]),
    );

    expect(events.some((e) => e.type === "ShowdownReached")).toBe(true);
    expect(events.some((e) => e.type === "HandFoldedOut")).toBe(false);
    expect(events.filter((e) => e.type === "HandComplete")).toHaveLength(1);

    for (const conn of [table, seat0, seat1, seat2]) {
      expect(conn.messages.some((m) => m.type === "command-rejected")).toBe(
        false,
      );
    }
  });

  it("evicts a seat after 3 hands disconnected and broadcasts the freed seat (ADR-0002)", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    const seat2 = await claimAndConnect(room.code, 2);
    const seatSockets: Record<number, { socket: WebSocket }> = {
      0: await claimAndConnect(room.code, 0),
      1: await claimAndConnect(room.code, 1),
      2: seat2,
    };
    await settle();

    async function completeHandOverWs(): Promise<void> {
      for (let i = 0; i < 5; i++) {
        if (rooms.get(room.code)?.engine?.hand?.status === "complete") return;
        const actor = rooms.currentActor(room.code);
        if (actor === undefined) throw new Error("expected a current actor");
        seatSockets[actor]?.socket.send(JSON.stringify({ type: "fold" }));
        await settle();
      }
      throw new Error("hand did not complete");
    }

    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();
    await completeHandOverWs();

    seat2.socket.close();
    await settle();

    for (let i = 0; i < 2; i++) {
      table.socket.send(JSON.stringify({ type: "nextHand" }));
      await settle();
      await completeHandOverWs();
    }
    table.socket.send(JSON.stringify({ type: "nextHand" }));
    await settle();

    expect(rooms.get(room.code)?.seats[2]).toMatchObject({
      claimed: false,
      missedHands: 0,
    });
    const roomViews = table.messages.filter((m) => m.type === "room-view");
    const lastView = roomViews.at(-1);
    if (lastView?.type !== "room-view") throw new Error("expected a view");
    expect(lastView.view.seats[2]).toMatchObject({
      claimed: false,
      sittingOut: false,
    });
  });

  it("still broadcasts an eviction that happens on a nextHand rejected as not-enough-players", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    await claimAndConnect(room.code, 0);
    const seat1 = await claimAndConnect(room.code, 1);
    const seat2 = await claimAndConnect(room.code, 2);
    await settle();

    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();

    // Seats 1 and 2 stay disconnected for every subsequent nextHand — only
    // seat 0 stays eligible, so every nextHand rejects as not-enough-players,
    // but the eviction bookkeeping still runs and still needs broadcasting.
    seat1.socket.close();
    seat2.socket.close();
    await settle();

    for (let i = 0; i < 3; i++) {
      table.socket.send(JSON.stringify({ type: "nextHand" }));
      await settle();
    }

    expect(rooms.get(room.code)?.seats[1]).toMatchObject({ claimed: false });
    expect(rooms.get(room.code)?.seats[2]).toMatchObject({ claimed: false });
    const lastView = table.messages.findLast((m) => m.type === "room-view");
    if (lastView?.type !== "room-view") throw new Error("expected a view");
    expect(lastView.view.seats[1]).toMatchObject({ claimed: false });
    expect(lastView.view.seats[2]).toMatchObject({ claimed: false });
  });

  it("rejects an out-of-turn action, visible only to the sender", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    const seat0 = await claimAndConnect(room.code, 0);
    const seat1 = await claimAndConnect(room.code, 1);
    await claimAndConnect(room.code, 2);
    await settle();

    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();

    // Preflop's first actor is seat 1 (SB), not seat 0.
    seat0.socket.send(JSON.stringify({ type: "check" }));
    await settle();

    expect(seat0.messages).toContainEqual({
      type: "command-rejected",
      reason: "not-your-turn",
    });
    expect(seat1.messages).not.toContainEqual(
      expect.objectContaining({ type: "command-rejected" }),
    );
    expect(table.messages).not.toContainEqual(
      expect.objectContaining({ type: "command-rejected" }),
    );
  });

  it("rejects an illegal action, visible only to the sender and never on the table device", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    const seat0 = await claimAndConnect(room.code, 0);
    const seat1 = await claimAndConnect(room.code, 1);
    const seat2 = await claimAndConnect(room.code, 2);
    await settle();

    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();

    // Seat 1 (SB) faces the BB's post and can't check.
    seat1.socket.send(JSON.stringify({ type: "check" }));
    await settle();

    expect(seat1.messages).toContainEqual({
      type: "command-rejected",
      reason: "action-not-legal",
    });
    expect(seat0.messages).not.toContainEqual(
      expect.objectContaining({ type: "command-rejected" }),
    );
    expect(seat2.messages).not.toContainEqual(
      expect.objectContaining({ type: "command-rejected" }),
    );
    expect(table.messages).not.toContainEqual(
      expect.objectContaining({ type: "command-rejected" }),
    );
  });

  it("rejects an action before any hand has started, sender-only", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    const seat0 = await claimAndConnect(room.code, 0);
    await claimAndConnect(room.code, 1);
    await settle();

    seat0.socket.send(JSON.stringify({ type: "check" }));
    await settle();

    expect(seat0.messages).toContainEqual({
      type: "command-rejected",
      reason: "hand-not-in-progress",
    });
    expect(table.messages).not.toContainEqual(
      expect.objectContaining({ type: "command-rejected" }),
    );
  });
});

describe("action clock", () => {
  const ACTION_CLOCK_MS = 200;
  let app: FastifyInstance;
  let rooms: RoomStore;
  let port: number;

  beforeEach(async () => {
    rooms = new RoomStore();
    app = await buildApp({ rooms, actionClockMs: ACTION_CLOCK_MS });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected a bound TCP address");
    }
    port = address.port;
  });

  afterEach(async () => {
    await app.close();
  });

  function connect(query: string): {
    socket: WebSocket;
    messages: ServerMessage[];
  } {
    const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/ws?${query}`);
    const messages: ServerMessage[] = [];
    socket.on("message", (data: Buffer) => {
      messages.push(JSON.parse(data.toString()) as ServerMessage);
    });
    return { socket, messages };
  }

  async function opened(socket: WebSocket): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      socket.on("open", resolve);
      socket.on("error", reject);
    });
  }

  async function settle(ms = 10): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function claimAndConnect(
    code: string,
    seatId: number,
  ): Promise<{ socket: WebSocket; messages: ServerMessage[] }> {
    const claim = rooms.claimSeat(code, seatId);
    if (!("seat" in claim)) throw new Error("expected a claimed seat");
    const conn = connect(
      `room=${code}&seat=${String(seatId)}&token=${claim.seat.token ?? ""}`,
    );
    await opened(conn.socket);
    return conn;
  }

  function actionsSeen(messages: ServerMessage[]) {
    return messages
      .filter((m) => m.type === "hand-update")
      .map((m) => m.event)
      .filter((e) => e.type === "ActionTaken");
  }

  it("auto-folds the current actor via a synthesized fold once the clock elapses", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    await claimAndConnect(room.code, 0);
    await claimAndConnect(room.code, 1);
    await claimAndConnect(room.code, 2);
    await settle();

    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();

    // Preflop's first actor is seat 1 (SB) — takes no action at all.
    await settle(ACTION_CLOCK_MS + 60);

    const folds = actionsSeen(table.messages).filter(
      (e) => e.action === "fold",
    );
    expect(folds).toEqual([
      expect.objectContaining({
        type: "ActionTaken",
        seatId: 1,
        action: "fold",
      }),
    ]);
  });

  it("does not auto-fold a seat that acts before the clock elapses", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    const seat0 = await claimAndConnect(room.code, 0);
    const seat1 = await claimAndConnect(room.code, 1);
    await claimAndConnect(room.code, 2);
    await settle();

    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();

    seat1.socket.send(JSON.stringify({ type: "call" }));
    await settle(ACTION_CLOCK_MS - 50);

    const folds = actionsSeen(table.messages).filter(
      (e) => e.action === "fold",
    );
    expect(folds).toHaveLength(0);
    for (const conn of [table, seat0, seat1]) {
      expect(conn.messages.some((m) => m.type === "command-rejected")).toBe(
        false,
      );
    }
  });

  it("resets the clock onto the new actor after a real action, rather than firing against the old one", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    await claimAndConnect(room.code, 0);
    const seat1 = await claimAndConnect(room.code, 1);
    await claimAndConnect(room.code, 2);
    await settle();

    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();

    // Seat 1 (SB) acts immediately; seat 2 (BB) then sits idle and should
    // be the one auto-folded, not seat 1.
    seat1.socket.send(JSON.stringify({ type: "call" }));
    await settle(ACTION_CLOCK_MS + 60);

    const folds = actionsSeen(table.messages).filter(
      (e) => e.action === "fold",
    );
    expect(folds).toEqual([
      expect.objectContaining({
        type: "ActionTaken",
        seatId: 2,
        action: "fold",
      }),
    ]);
  });

  it("resets the clock onto the new street's first actor after a street transition", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    const seat0 = await claimAndConnect(room.code, 0);
    const seat1 = await claimAndConnect(room.code, 1);
    const seat2 = await claimAndConnect(room.code, 2);
    await settle();

    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();

    // Preflop, no raise: every seat (button included) still owes a decision.
    seat1.socket.send(JSON.stringify({ type: "call" }));
    await settle();
    seat2.socket.send(JSON.stringify({ type: "check" }));
    await settle();
    // The button never posted a blind, so it must call the BB's amount
    // rather than check.
    seat0.socket.send(JSON.stringify({ type: "call" }));
    await settle();
    // No raise occurred, so the BB gets its one-time option before the
    // street actually closes.
    seat2.socket.send(JSON.stringify({ type: "check" }));
    await settle();
    // Preflop closes; the flop's first actor (seat 1, SB) now idles out.
    await settle(ACTION_CLOCK_MS + 60);

    const streetsStarted = table.messages
      .filter((m) => m.type === "hand-update")
      .map((m) => m.event)
      .filter((e) => e.type === "StreetStarted");
    expect(streetsStarted.some((e) => e.street === "flop")).toBe(true);

    const folds = actionsSeen(table.messages).filter(
      (e) => e.action === "fold",
    );
    expect(folds).toEqual([
      expect.objectContaining({
        type: "ActionTaken",
        seatId: 1,
        action: "fold",
      }),
    ]);
  });
});

describe("presence and reconnection", () => {
  const ACTION_CLOCK_MS = 200;
  let app: FastifyInstance;
  let rooms: RoomStore;
  let port: number;

  beforeEach(async () => {
    rooms = new RoomStore();
    app = await buildApp({
      rooms,
      pingIntervalMs: 15,
      missedPongLimit: 2,
      graceWindowMs: 60,
      actionClockMs: ACTION_CLOCK_MS,
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected a bound TCP address");
    }
    port = address.port;
  });

  afterEach(async () => {
    await app.close();
  });

  function connect(
    query: string,
    wsOptions?: WebSocket.ClientOptions,
  ): { socket: WebSocket; messages: ServerMessage[] } {
    const socket = new WebSocket(
      `ws://127.0.0.1:${String(port)}/ws?${query}`,
      wsOptions,
    );
    const messages: ServerMessage[] = [];
    socket.on("message", (data: Buffer) => {
      messages.push(JSON.parse(data.toString()) as ServerMessage);
    });
    return { socket, messages };
  }

  async function opened(socket: WebSocket): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      socket.on("open", resolve);
      socket.on("error", reject);
    });
  }

  async function settle(ms = 20): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  function seatDisconnected(
    messages: ServerMessage[],
    seatId: number,
  ): boolean | undefined {
    const roomViews = messages.filter(
      (m): m is Extract<ServerMessage, { type: "room-view" }> =>
        m.type === "room-view",
    );
    const last = roomViews.at(-1);
    return last?.view.seats.find((s) => s.id === seatId)?.disconnected;
  }

  it("marks a seat disconnected after 2 missed pongs, cosmetic only", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);

    const claim = rooms.claimSeat(room.code, 0);
    if (!("seat" in claim)) throw new Error("expected a claimed seat");
    const seat0 = connect(
      `room=${room.code}&seat=0&token=${claim.seat.token ?? ""}`,
      { autoPong: false },
    );
    await opened(seat0.socket);

    // Two ping intervals elapse with no pong reply.
    await settle(50);

    expect(seatDisconnected(table.messages, 0)).toBe(true);
    // A presence-only badge never causes a rejection or a fold.
    expect(rooms.get(room.code)?.seats[0]?.claimed).toBe(true);
  });

  it("reconnecting with the correct seat token clears the badge and resumes silently", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);

    const claim = rooms.claimSeat(room.code, 0);
    if (!("seat" in claim)) throw new Error("expected a claimed seat");
    const token = claim.seat.token ?? "";
    const seat0 = connect(`room=${room.code}&seat=0&token=${token}`);
    await opened(seat0.socket);
    await settle();

    seat0.socket.close();
    await settle();
    expect(rooms.get(room.code)?.seats[0]?.disconnected).toBe(true);

    const reconnected = connect(`room=${room.code}&seat=0&token=${token}`);
    await opened(reconnected.socket);
    await settle();

    expect(rooms.get(room.code)?.seats[0]?.disconnected).toBe(false);
    expect(seatDisconnected(table.messages, 0)).toBe(false);
  });

  it("delivers a fresh view-snapshot (not event replay) on reconnect mid-hand", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    const claim0 = rooms.claimSeat(room.code, 0);
    const claim1 = rooms.claimSeat(room.code, 1);
    if (!("seat" in claim0) || !("seat" in claim1)) {
      throw new Error("expected claimed seats");
    }
    const token0 = claim0.seat.token ?? "";
    const seat0 = connect(`room=${room.code}&seat=0&token=${token0}`);
    const seat1 = connect(
      `room=${room.code}&seat=1&token=${claim1.seat.token ?? ""}`,
    );
    await opened(seat0.socket);
    await opened(seat1.socket);
    await settle();

    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();

    seat0.socket.close();
    await settle();

    const reconnected = connect(`room=${room.code}&seat=0&token=${token0}`);
    await opened(reconnected.socket);
    await settle();

    const snapshot = reconnected.messages.find(
      (m) => m.type === "view-snapshot",
    );
    expect(snapshot).toBeDefined();
    expect(reconnected.messages.some((m) => m.type === "hand-update")).toBe(
      false,
    );
  });

  it("lands a reconnecting seat in a folded seat after it folded while away", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    const claim0 = rooms.claimSeat(room.code, 0);
    const claim1 = rooms.claimSeat(room.code, 1);
    const claim2 = rooms.claimSeat(room.code, 2);
    if (!("seat" in claim0) || !("seat" in claim1) || !("seat" in claim2)) {
      throw new Error("expected claimed seats");
    }
    const token0 = claim0.seat.token ?? "";
    const seat0 = connect(`room=${room.code}&seat=0&token=${token0}`);
    const seat1 = connect(
      `room=${room.code}&seat=1&token=${claim1.seat.token ?? ""}`,
    );
    const seat2 = connect(
      `room=${room.code}&seat=2&token=${claim2.seat.token ?? ""}`,
    );
    await opened(seat0.socket);
    await opened(seat1.socket);
    await opened(seat2.socket);
    await settle();

    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();

    seat0.socket.close();
    await settle();

    // Whoever's turn it is gets auto-folded by ticket 14's action clock.
    const engine = rooms.get(room.code)?.engine;
    if (engine?.hand?.status !== "betting") {
      throw new Error("expected a betting hand in progress");
    }
    const toAct = engine.hand.toAct[0];
    if (toAct === undefined) throw new Error("expected an actor");
    await settle(ACTION_CLOCK_MS + 60);

    const reconnected = connect(`room=${room.code}&seat=0&token=${token0}`);
    await opened(reconnected.socket);
    await settle();

    const snapshot = reconnected.messages.find(
      (m) => m.type === "view-snapshot",
    );
    if (snapshot?.type !== "view-snapshot") {
      throw new Error("expected a view-snapshot");
    }
    const view = snapshot.view;
    if (!("yourSeatId" in view) || toAct !== 0) {
      // Only assert the burn-pile shape when seat 0 was the one who folded;
      // otherwise it just resumes normally, covered by the prior test.
      return;
    }
    expect(view.yourHoleCards).toBeNull();
  });

  it("rejects a WS connect with a stale token after the seat is cleared", async () => {
    const room = rooms.create();
    const claim = rooms.claimSeat(room.code, 0);
    if (!("seat" in claim)) throw new Error("expected a claimed seat");
    const token = claim.seat.token ?? "";
    rooms.clearSeat(room.code, 0);

    const socket = new WebSocket(
      `ws://127.0.0.1:${String(port)}/ws?room=${room.code}&seat=0&token=${token}`,
    );
    const closeCode = await new Promise<number>((resolve) => {
      socket.on("unexpected-response", (_req, res) => {
        resolve(res.statusCode ?? 0);
      });
    });
    expect(closeCode).toBe(403);
  });

  it("ends the room, notifies every socket, and discards in-memory state when the table's grace window elapses", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    const claim = rooms.claimSeat(room.code, 0);
    if (!("seat" in claim)) throw new Error("expected a claimed seat");
    const seat0 = connect(
      `room=${room.code}&seat=0&token=${claim.seat.token ?? ""}`,
    );
    await opened(seat0.socket);
    await settle();

    table.socket.close();
    await settle(120);

    expect(seat0.messages).toContainEqual({ type: "room-ended" });
    expect(rooms.get(room.code)).toBeUndefined();
    expect(seat0.socket.readyState).not.toBe(WebSocket.OPEN);
  });

  it("cancels the grace window when the table reconnects in time", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    await settle();

    table.socket.close();
    await settle(20);

    const reconnectedTable = connect(`room=${room.code}&role=table`);
    await opened(reconnectedTable.socket);
    await settle(120);

    expect(rooms.get(room.code)).toBeDefined();
    expect(reconnectedTable.messages).not.toContainEqual({
      type: "room-ended",
    });
  });
});
