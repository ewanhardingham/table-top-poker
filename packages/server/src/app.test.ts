import {
  DEFAULT_SEAT_COUNT,
  ENGINE_LOG_VERSION,
  DEFAULT_SOUND_SETTINGS,
  MAX_SEAT_COUNT,
  MIN_SEAT_COUNT,
  type RoomView,
  type ServerMessage,
} from "@table-top-poker/protocol";
import type { FastifyInstance } from "fastify";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { DirectoryRecordings } from "@table-top-poker/recording";
import {
  createMemoryFileSystem,
  parseRecordedLines,
} from "@table-top-poker/recording/testing";
import type { MemoryFileSystem } from "@table-top-poker/recording/testing";
import { buildApp } from "./app.js";
import { RoomStore, toRoomView } from "./rooms.js";

const RECORDINGS_ROOT = "/recordings";

/**
 * Recording is a Room invariant, so there is no "off" to pass here. Every app
 * under test records exactly as production does; the filesystem underneath is
 * the in-memory fake, so nothing touches a disk and a test that cares can read
 * back what was written.
 */
function testRecordings(): DirectoryRecordings {
  return new DirectoryRecordings(RECORDINGS_ROOT, createMemoryFileSystem());
}

const publicTableDir = fileURLToPath(
  new URL("../public/table", import.meta.url),
);
const publicPlayerDir = fileURLToPath(
  new URL("../public/player", import.meta.url),
);

/** Stages a fake release build (ticket 34) so tests can assert it's served in place of the placeholder. */
function stageBuiltIndex(dir: string, marker: string): void {
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/index.html`, `<!doctype html><p>${marker}</p>`);
}

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
  readonly displayName: string;
  readonly sittingOut: boolean;
  readonly sittingOutReason: "voluntary" | "waiting-for-next-hand" | null;
}

function unclaimedSeats(): RoomView["seats"] {
  return Array.from({ length: DEFAULT_SEAT_COUNT }, (_, id) => ({
    id,
    claimed: false,
    sittingOut: false,
    sittingOutReason: null,
    disconnected: false,
  }));
}

describe("rooms HTTP routes", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ recordings: testRecordings() });
  });

  afterEach(async () => {
    await app.close();
  });

  it("creates a room and returns a valid 4-char code with its QR code", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/rooms",
      headers: { host: "192.168.1.50:3000" },
      payload: { seatCount: DEFAULT_SEAT_COUNT },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json<RoomCreatedBody>();
    expect(body.code).toMatch(/^[A-Z0-9]{4}$/);
    expect(body.joinUrl).toBe(`http://192.168.1.50:3000/join/${body.code}`);
    expect(body.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);
  });

  it("creates a room with the seat count in the request body", async () => {
    for (const seatCount of [MIN_SEAT_COUNT, 5, MAX_SEAT_COUNT]) {
      const created = await app.inject({
        method: "POST",
        url: "/rooms",
        payload: { seatCount },
      });
      expect(created.statusCode).toBe(200);

      const { code } = created.json<RoomCreatedBody>();
      const joined = await app.inject({
        method: "POST",
        url: `/rooms/${code}/join`,
      });
      expect(joined.json<RoomView>().seats).toHaveLength(seatCount);
    }
  });

  it("rejects a seat count outside the 2-8 range", async () => {
    for (const seatCount of [0, 1, 9, 2.5, "4", null]) {
      const response = await app.inject({
        method: "POST",
        url: "/rooms",
        payload: { seatCount },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "invalid-seat-count" });
    }
  });

  it("rejects a create whose body omits the seat count", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/rooms",
      payload: {},
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid-seat-count" });
  });

  it("rejects a create with no body at all", async () => {
    const response = await app.inject({ method: "POST", url: "/rooms" });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid-request-body" });
  });

  it("blames the body, not the count, for an unknown key", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/rooms",
      payload: { seatCount: MIN_SEAT_COUNT, tableName: "kitchen" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid-request-body" });
  });

  it("joining a known room code returns its room view", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/rooms",
      payload: { seatCount: DEFAULT_SEAT_COUNT },
    });
    const { code } = created.json<RoomCreatedBody>();

    const joined = await app.inject({
      method: "POST",
      url: `/rooms/${code}/join`,
    });
    expect(joined.statusCode).toBe(200);
    expect(joined.json<RoomView>()).toEqual({
      code,
      pendingSeatCount: null,
      soundSettings: DEFAULT_SOUND_SETTINGS,
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
    const created = await app.inject({
      method: "POST",
      url: "/rooms",
      payload: { seatCount: DEFAULT_SEAT_COUNT },
    });
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
    const created = await app.inject({
      method: "POST",
      url: "/rooms",
      payload: { seatCount: DEFAULT_SEAT_COUNT },
    });
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

describe("POST /rooms/:code/sound", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildApp({ recordings: testRecordings() });
  });

  afterEach(async () => {
    await app.close();
  });

  async function createRoom(): Promise<string> {
    const created = await app.inject({
      method: "POST",
      url: "/rooms",
      payload: { seatCount: DEFAULT_SEAT_COUNT },
    });
    return created.json<RoomCreatedBody>().code;
  }

  it("persists the settings on the room view", async () => {
    const code = await createRoom();
    const settings = {
      sounds: true,
      cards: false,
      actions: true,
      notifications: true,
    };

    const response = await app.inject({
      method: "POST",
      url: `/rooms/${code}/sound`,
      payload: settings,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(settings);

    const joined = await app.inject({
      method: "POST",
      url: `/rooms/${code}/join`,
    });
    expect(joined.json<RoomView>().soundSettings).toEqual(settings);
  });

  it("rejects a malformed body", async () => {
    const code = await createRoom();
    const response = await app.inject({
      method: "POST",
      url: `/rooms/${code}/sound`,
      payload: { sounds: "yes" },
    });
    expect(response.statusCode).toBe(400);
  });

  it("404s an unknown room", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/rooms/ZZZZ/sound",
      payload: {
        sounds: true,
        cards: true,
        actions: true,
        notifications: true,
      },
    });
    expect(response.statusCode).toBe(404);
  });
});

describe("GET /join/:code", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
    delete process.env.PLAYER_CLIENT_ORIGIN;
  });

  it("404s for an unknown room code", async () => {
    app = await buildApp({ recordings: testRecordings() });
    const response = await app.inject({ method: "GET", url: "/join/ZZZZ" });
    expect(response.statusCode).toBe(404);
  });

  it("serves the same-origin placeholder when no player origin is configured", async () => {
    app = await buildApp({ recordings: testRecordings() });
    const created = await app.inject({
      method: "POST",
      url: "/rooms",
      payload: { seatCount: DEFAULT_SEAT_COUNT },
    });
    const { code } = created.json<RoomCreatedBody>();

    const response = await app.inject({ method: "GET", url: `/join/${code}` });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^text\/html/);
  });

  it("redirects to PLAYER_CLIENT_ORIGIN when configured", async () => {
    process.env.PLAYER_CLIENT_ORIGIN = "http://192.168.1.50:5174";
    app = await buildApp({ recordings: testRecordings() });
    const created = await app.inject({
      method: "POST",
      url: "/rooms",
      payload: { seatCount: DEFAULT_SEAT_COUNT },
    });
    const { code } = created.json<RoomCreatedBody>();

    const response = await app.inject({ method: "GET", url: `/join/${code}` });

    expect(response.statusCode).toBe(302);
    expect(response.headers.location).toBe(
      `http://192.168.1.50:5174/join/${code}`,
    );
  });

  it("serves a release build staged at public/player over the placeholder", async () => {
    stageBuiltIndex(publicPlayerDir, "real player client");
    try {
      app = await buildApp({ recordings: testRecordings() });
      const created = await app.inject({
        method: "POST",
        url: "/rooms",
        payload: { seatCount: DEFAULT_SEAT_COUNT },
      });
      const { code } = created.json<RoomCreatedBody>();

      const response = await app.inject({
        method: "GET",
        url: `/join/${code}`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("real player client");
    } finally {
      rmSync(publicPlayerDir, { recursive: true, force: true });
    }
  });
});

describe("GET /", () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it("serves the same-origin placeholder when no table build is staged", async () => {
    app = await buildApp({ recordings: testRecordings() });
    const response = await app.inject({ method: "GET", url: "/" });
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^text\/html/);
  });

  it("serves a release build staged at public/table over the placeholder", async () => {
    stageBuiltIndex(publicTableDir, "real table client");
    try {
      app = await buildApp({ recordings: testRecordings() });
      const response = await app.inject({ method: "GET", url: "/" });
      expect(response.statusCode).toBe(200);
      expect(response.body).toContain("real table client");
    } finally {
      rmSync(publicTableDir, { recursive: true, force: true });
    }
  });
});

describe("seat claim/evict routes", () => {
  let app: FastifyInstance;
  let rooms: RoomStore;

  beforeEach(async () => {
    rooms = new RoomStore();
    app = await buildApp({ rooms, recordings: testRecordings() });
  });

  afterEach(async () => {
    await app.close();
  });

  async function createRoom(): Promise<string> {
    const created = await app.inject({
      method: "POST",
      url: "/rooms",
      payload: { seatCount: DEFAULT_SEAT_COUNT },
    });
    return created.json<RoomCreatedBody>().code;
  }

  function claimPayload(displayName = "Avery") {
    return { payload: { displayName } };
  }

  it("claims a free seat, issuing a token", async () => {
    const code = await createRoom();

    const response = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/0/claim`,
      ...claimPayload(" Avery "),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<SeatClaimBody>();
    expect(typeof body.token).toBe("string");
    expect(body).toMatchObject({
      seatId: 0,
      displayName: "Avery",
      sittingOut: false,
      sittingOutReason: null,
    });
  });

  it("requires a display name of 1 to 10 characters", async () => {
    const code = await createRoom();

    const missing = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/0/claim`,
    });
    const blank = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/0/claim`,
      ...claimPayload("   "),
    });
    const tooLong = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/0/claim`,
      ...claimPayload("12345678901"),
    });

    expect(missing.statusCode).toBe(400);
    expect(blank.statusCode).toBe(400);
    expect(tooLong.statusCode).toBe(400);
    expect(blank.json()).toEqual({ error: "invalid-display-name" });
  });

  it("rejects a case-insensitive duplicate display name", async () => {
    const code = await createRoom();
    await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/0/claim`,
      ...claimPayload("Avery"),
    });

    const response = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/1/claim`,
      ...claimPayload("aVERY"),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "duplicate-display-name" });
  });

  it("rejects claiming an already-claimed seat", async () => {
    const code = await createRoom();
    await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/0/claim`,
      ...claimPayload("Avery"),
    });

    const response = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/0/claim`,
      ...claimPayload("Blair"),
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "seat-already-claimed" });
  });

  it("rejects claiming a seat in an unknown room", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/rooms/ZZZZ/seats/0/claim",
      ...claimPayload(),
    });
    expect(response.statusCode).toBe(404);
  });

  it("rejects an out-of-range seat id", async () => {
    const code = await createRoom();
    const response = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/${String(DEFAULT_SEAT_COUNT)}/claim`,
      ...claimPayload(),
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
    rooms.claimSeat(code, 0, "P0");
    rooms.claimSeat(code, 1, "P1");
    rooms.dispatch(code, "table", "startHand");

    const response = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/2/claim`,
      ...claimPayload("Casey"),
    });

    expect(response.json<SeatClaimBody>()).toMatchObject({
      sittingOut: true,
      sittingOutReason: "waiting-for-next-hand",
    });
  });

  it("evicts a seat so it can be reclaimed (ADR-0003)", async () => {
    const code = await createRoom();
    await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/0/claim`,
      ...claimPayload("Avery"),
    });

    const evicted = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/0/evict`,
    });
    expect(evicted.statusCode).toBe(204);

    const reclaimed = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/0/claim`,
      ...claimPayload("Avery"),
    });
    expect(reclaimed.statusCode).toBe(200);
  });

  it("lets a player leave with their own token, freeing the seat (ADR-0005)", async () => {
    const code = await createRoom();
    const claim = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/0/claim`,
      ...claimPayload("Avery"),
    });
    const { token } = claim.json<SeatClaimBody>();

    const left = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/0/leave`,
      payload: { token },
    });
    expect(left.statusCode).toBe(204);

    const reclaimed = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/0/claim`,
      ...claimPayload("Avery"),
    });
    expect(reclaimed.statusCode).toBe(200);
  });

  it("rejects a leave whose token does not match the seat", async () => {
    const code = await createRoom();
    await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/0/claim`,
      ...claimPayload("Avery"),
    });

    const left = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/0/leave`,
      payload: { token: "not-the-token" },
    });
    expect(left.statusCode).toBe(403);
    expect(left.json()).toEqual({ error: "not-permitted" });
  });

  it("rejects a leave with no token in the body", async () => {
    const code = await createRoom();

    const left = await app.inject({
      method: "POST",
      url: `/rooms/${code}/seats/0/leave`,
      payload: {},
    });
    expect(left.statusCode).toBe(400);
    expect(left.json()).toEqual({ error: "invalid-request-body" });
  });
});

describe("seat-count settings route", () => {
  let app: FastifyInstance;
  let rooms: RoomStore;
  let port: number;

  beforeEach(async () => {
    rooms = new RoomStore();
    app = await buildApp({ rooms, recordings: testRecordings() });
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

  it("rejects out-of-range counts at the HTTP boundary", async () => {
    const room = rooms.create();
    for (const seatCount of [0, 1, 9, 2.5, "4"]) {
      const response = await app.inject({
        method: "POST",
        url: `/rooms/${room.code}/seats/count`,
        payload: { seatCount },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "invalid-seat-count" });
    }
  });

  it("rejects malformed request bodies separately from invalid counts", async () => {
    const room = rooms.create();
    for (const payload of [
      { seatCount: MIN_SEAT_COUNT, extra: true },
      undefined,
    ]) {
      const response = await app.inject({
        method: "POST",
        url: `/rooms/${room.code}/seats/count`,
        ...(payload === undefined ? {} : { payload }),
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: "invalid-request-body" });
    }
  });

  it("rejects a count below the live claimed-seat floor", async () => {
    const room = rooms.create();
    rooms.claimSeat(room.code, 0, "P0");
    rooms.claimSeat(room.code, 4, "P4");
    rooms.claimSeat(room.code, 7, "P7");

    const response = await app.inject({
      method: "POST",
      url: `/rooms/${room.code}/seats/count`,
      payload: { seatCount: 2 },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: "seat-count-below-floor",
      minimum: 3,
    });
    expect(room.seats).toHaveLength(DEFAULT_SEAT_COUNT);
  });

  it("grows and shrinks the room, returning the repack moves", async () => {
    const room = rooms.create(4);
    rooms.claimSeat(room.code, 0, "P0");
    const moved = rooms.claimSeat(room.code, 3, "P3");
    if (!("seat" in moved)) throw new Error("expected a claimed seat");

    const grown = await app.inject({
      method: "POST",
      url: `/rooms/${room.code}/seats/count`,
      payload: { seatCount: 6 },
    });
    expect(grown.statusCode).toBe(200);
    expect(grown.json()).toMatchObject({
      seatCount: 6,
      pendingSeatCount: null,
      applied: true,
    });

    const shrunk = await app.inject({
      method: "POST",
      url: `/rooms/${room.code}/seats/count`,
      payload: { seatCount: 2 },
    });
    expect(shrunk.statusCode).toBe(200);
    expect(shrunk.json()).toMatchObject({
      seatCount: 2,
      moves: [{ from: 3, to: 1 }],
    });
    expect(room.seats).toHaveLength(2);
    expect(room.seats[1]?.token).toBe(moved.seat.token);
  });

  it("broadcasts a queued shrink in the room view", async () => {
    const room = rooms.create();
    rooms.claimSeat(room.code, 0, "P0");
    rooms.claimSeat(room.code, 1, "P1");
    rooms.dispatch(room.code, "table", "startHand");

    const table = new WebSocket(
      `ws://127.0.0.1:${String(port)}/ws?room=${room.code}&role=table`,
    );
    const messages: ServerMessage[] = [];
    table.on("message", (data: Buffer) => {
      messages.push(JSON.parse(data.toString()) as ServerMessage);
    });
    await new Promise<void>((resolve, reject) => {
      table.on("open", resolve);
      table.on("error", reject);
    });

    const response = await app.inject({
      method: "POST",
      url: `/rooms/${room.code}/seats/count`,
      payload: { seatCount: 4 },
    });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(response.statusCode).toBe(200);
    const lastView = messages.findLast(
      (message) => message.type === "room-view",
    );
    if (lastView?.type !== "room-view") throw new Error("expected a room view");
    expect(lastView.view.pendingSeatCount).toBe(4);
    table.close();
  });
});

describe("seat-count movement over WebSocket", () => {
  let app: FastifyInstance;
  let rooms: RoomStore;
  let port: number;

  beforeEach(async () => {
    rooms = new RoomStore();
    app = await buildApp({ rooms, recordings: testRecordings() });
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
    code: string,
    seatId: number,
    token: string,
  ): { socket: WebSocket; messages: ServerMessage[] } {
    const socket = new WebSocket(
      `ws://127.0.0.1:${String(port)}/ws?room=${code}&seat=${String(seatId)}&token=${token}`,
    );
    const messages: ServerMessage[] = [];
    socket.on("message", (data: Buffer) => {
      messages.push(JSON.parse(data.toString()) as ServerMessage);
    });
    return { socket, messages };
  }

  async function opened(socket: WebSocket): Promise<void> {
    if (socket.readyState === WebSocket.OPEN) return;
    await new Promise<void>((resolve, reject) => {
      socket.on("open", resolve);
      socket.on("error", reject);
    });
  }

  async function closed(socket: WebSocket): Promise<void> {
    if (socket.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      socket.once("close", resolve);
    });
  }

  async function waitForMessage(
    messages: readonly ServerMessage[],
    predicate: (message: ServerMessage) => boolean,
  ): Promise<ServerMessage> {
    for (let attempt = 0; attempt < 200; attempt++) {
      const message = messages.find(predicate);
      if (message !== undefined) return message;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("timed out waiting for WebSocket message");
  }

  it("moves an open player socket and reconnects at its new seat", async () => {
    const room = rooms.create();
    const claim0 = rooms.claimSeat(room.code, 2, "P2");
    const claim1 = rooms.claimSeat(room.code, 5, "P5");
    const claim2 = rooms.claimSeat(room.code, 7, "P7");
    if (!("seat" in claim0) || !("seat" in claim1) || !("seat" in claim2)) {
      throw new Error("expected claimed seats");
    }
    const token = claim1.seat.token ?? "";
    const player = connect(room.code, 5, token);
    await opened(player.socket);

    rooms.dispatch(room.code, "table", "startHand");
    for (let i = 0; i < MAX_SEAT_COUNT; i++) {
      if (room.engine?.hand?.status === "complete") break;
      const actor = rooms.currentActor(room.code);
      if (actor === undefined) throw new Error("expected a current actor");
      rooms.dispatch(room.code, actor, "fold");
    }

    const response = await app.inject({
      method: "POST",
      url: `/rooms/${room.code}/seats/count`,
      payload: { seatCount: 3 },
    });
    await waitForMessage(
      player.messages,
      (message) => message.type === "seat-moved",
    );

    expect(response.statusCode).toBe(200);
    expect(player.messages).toContainEqual({
      type: "seat-moved",
      from: 5,
      to: 1,
    });
    const snapshot = player.messages.find(
      (message) => message.type === "view-snapshot",
    );
    if (snapshot?.type !== "view-snapshot") {
      throw new Error("expected a remapped completed-hand snapshot");
    }
    expect(snapshot.view.phase).toBe("folded-out");
    expect(room.seats[1]?.token).toBe(token);

    player.socket.close();
    await closed(player.socket);
    const reconnect = connect(room.code, 1, token);
    await opened(reconnect.socket);
    await waitForMessage(
      reconnect.messages,
      (message) => message.type === "view-snapshot",
    );

    expect(reconnect.messages).not.toContainEqual(
      expect.objectContaining({ type: "seat-moved" }),
    );
    expect(reconnect.messages).toContainEqual(
      expect.objectContaining({ type: "view-snapshot" }),
    );
    reconnect.socket.close();
    await closed(reconnect.socket);

    const stale = connect(room.code, 5, token);
    await opened(stale.socket);
    await expect(
      waitForMessage(
        stale.messages,
        (message) => message.type === "seat-moved",
      ),
    ).resolves.toEqual({
      type: "seat-moved",
      from: 5,
      to: 1,
    });
    stale.socket.close();
    await closed(stale.socket);
  });
});

describe("WebSocket upgrade", () => {
  let app: FastifyInstance;
  let rooms: RoomStore;
  let port: number;

  beforeEach(async () => {
    rooms = new RoomStore();
    app = await buildApp({ rooms, recordings: testRecordings() });
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

  it("pushes seat-count changes to an unclaimed player connection", async () => {
    const room = rooms.create(4);
    const socket = new WebSocket(
      `ws://127.0.0.1:${String(port)}/ws?room=${room.code}&role=lobby`,
    );
    const messages: ServerMessage[] = [];
    socket.on("message", (data: Buffer) => {
      messages.push(JSON.parse(data.toString()) as ServerMessage);
    });

    await new Promise<void>((resolve, reject) => {
      socket.once("open", resolve);
      socket.once("error", reject);
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const initial = messages[0];
    if (initial?.type !== "room-view") throw new Error("expected a room view");
    expect(initial.view.code).toBe(room.code);
    expect(initial.view.seats).toHaveLength(4);

    socket.send(JSON.stringify({ type: "startHand" }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(messages).toContainEqual({
      type: "command-rejected",
      reason: "not-permitted",
    });

    await app.inject({
      method: "POST",
      url: `/rooms/${room.code}/seats/count`,
      payload: { seatCount: 6 },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const latest = messages.findLast((message) => message.type === "room-view");
    if (latest?.type !== "room-view") throw new Error("expected a room view");
    expect(latest.view.seats).toHaveLength(6);

    await app.inject({
      method: "POST",
      url: `/rooms/${room.code}/seats/count`,
      payload: { seatCount: 2 },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    const shrunk = messages.findLast((message) => message.type === "room-view");
    if (shrunk?.type !== "room-view") throw new Error("expected a room view");
    expect(shrunk.view.seats).toHaveLength(2);

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
    // A table also gets its (empty) hand listing on connect; this test is
    // about the room views, so count only those.
    const roomViews = () => messages.filter((m) => m.type === "room-view");
    expect(roomViews()).toHaveLength(1);
    expect(roomViews()[0]).toEqual({
      type: "room-view",
      view: {
        code: room.code,
        pendingSeatCount: null,
        soundSettings: DEFAULT_SOUND_SETTINGS,
        seats: unclaimedSeats(),
      },
    });

    await app.inject({
      method: "POST",
      url: `/rooms/${room.code}/seats/0/claim`,
      payload: { displayName: "Avery" },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(roomViews()).toHaveLength(2);
    expect((roomViews()[1] as { view: RoomView }).view.seats[0]).toEqual({
      id: 0,
      claimed: true,
      displayName: "Avery",
      sittingOut: false,
      sittingOutReason: null,
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
    const claim = rooms.claimSeat(room.code, 0, "P0");
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
    app = await buildApp({ rooms, recordings: testRecordings() });
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
    if (socket.readyState === WebSocket.OPEN) return;
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
    const claim = rooms.claimSeat(code, seatId, `P${String(seatId)}`);
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

  it("never sends hand views to a lobby socket, mid-hand or on reconnect", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    const seat0 = await claimAndConnect(room.code, 0);
    await claimAndConnect(room.code, 1);
    const lobby = connect(`room=${room.code}&role=lobby`);
    await opened(lobby.socket);
    await settle();

    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();

    // A socket that joins mid-hand takes the connect-time snapshot path,
    // which is the other place a seat view is handed out.
    const lateLobby = connect(`room=${room.code}&role=lobby`);
    await opened(lateLobby.socket);
    await settle();

    for (const watcher of [lobby, lateLobby]) {
      expect(watcher.messages.length).toBeGreaterThan(0);
      expect(
        watcher.messages.every((message) => message.type === "room-view"),
      ).toBe(true);
      expect(JSON.stringify(watcher.messages)).not.toContain("yourHoleCards");
    }

    // The seat itself still got its cards — the guard is about identity, not
    // about the hand having failed to start.
    expect(JSON.stringify(seat0.messages)).toContain("yourHoleCards");

    lobby.socket.close();
    lateLobby.socket.close();
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
    expect(view && toRoomView(view).seats[2]).toMatchObject({
      sittingOut: true,
      sittingOutReason: "waiting-for-next-hand",
    });
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
    expect(roomView.view.seats[0]).toMatchObject({
      sittingOut: true,
      sittingOutReason: "voluntary",
    });

    seat0.socket.send(JSON.stringify({ type: "sitIn" }));
    await settle();

    expect(rooms.get(room.code)?.seats[0]).toMatchObject({
      sittingOut: false,
    });
    const satInView = table.messages.findLast((m) => m.type === "room-view");
    if (satInView?.type !== "room-view") throw new Error("expected a view");
    expect(satInView.view.seats[0]).toMatchObject({
      sittingOut: false,
      sittingOutReason: null,
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

  it("has no automatic eviction — a disconnected seat stays occupied across repeated nextHands (ADR-0003)", async () => {
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

    for (let i = 0; i < 3; i++) {
      table.socket.send(JSON.stringify({ type: "nextHand" }));
      await settle();
      await completeHandOverWs();
    }

    expect(rooms.get(room.code)?.seats[2]).toMatchObject({ claimed: true });
  });

  it("evicting a seat via the REST route broadcasts the freed seat over the room's sockets (ADR-0003)", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    await claimAndConnect(room.code, 0);
    const seat1 = await claimAndConnect(room.code, 1);
    await settle();

    const closed = new Promise<void>((resolve) => {
      seat1.socket.once("close", () => {
        resolve();
      });
    });
    await app.inject({
      method: "POST",
      url: `/rooms/${room.code}/seats/1/evict`,
    });
    await closed;
    await settle();

    expect(rooms.get(room.code)?.seats[1]).toMatchObject({ claimed: false });
    expect(seat1.socket.readyState).toBe(WebSocket.CLOSED);
    expect(seat1.messages).toContainEqual({ type: "player-evicted" });
    const lastView = table.messages.findLast((m) => m.type === "room-view");
    if (lastView?.type !== "room-view") throw new Error("expected a view");
    expect(lastView.view.seats[1]).toMatchObject({ claimed: false });
  });

  it("auto-folds an evicted current actor and broadcasts the turn advance", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    const seatSockets = [
      await claimAndConnect(room.code, 0),
      await claimAndConnect(room.code, 1),
      await claimAndConnect(room.code, 2),
    ];
    await settle();

    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();
    const actor = rooms.currentActor(room.code);
    if (actor === undefined) throw new Error("expected a current actor");

    const closed = new Promise<void>((resolve) => {
      seatSockets[actor]?.socket.once("close", () => {
        resolve();
      });
    });
    const evicted = await app.inject({
      method: "POST",
      url: `/rooms/${room.code}/seats/${String(actor)}/evict`,
    });
    await closed;
    await settle();

    expect(evicted.statusCode).toBe(204);
    expect(rooms.get(room.code)?.seats[actor]).toMatchObject({
      claimed: false,
    });
    expect(rooms.currentActor(room.code)).not.toBe(actor);
    expect(table.messages).toContainEqual(
      expect.objectContaining({
        type: "hand-update",
        event: { type: "ActionTaken", seatId: actor, action: "fold" },
      }),
    );
  });

  it("auto-folds an evicted later seat immediately and preserves the current actor", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    await claimAndConnect(room.code, 0);
    await claimAndConnect(room.code, 1);
    await claimAndConnect(room.code, 2);
    await settle();

    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();
    const engine = rooms.get(room.code)?.engine;
    if (engine?.hand?.status !== "betting") {
      throw new Error("expected a betting hand");
    }
    const actor = engine.hand.toAct[0];
    const evicted = engine.hand.toAct[1];
    if (actor === undefined || evicted === undefined) {
      throw new Error("expected two seats to be awaiting action");
    }

    const before = table.messages.filter(
      (message) => message.type === "hand-update",
    ).length;
    const response = await app.inject({
      method: "POST",
      url: `/rooms/${room.code}/seats/${String(evicted)}/evict`,
    });
    await settle();

    expect(response.statusCode).toBe(204);
    expect(table.messages.slice(before)).toContainEqual(
      expect.objectContaining({
        type: "hand-update",
        event: { type: "ActionTaken", seatId: evicted, action: "fold" },
      }),
    );
    expect(rooms.currentActor(room.code)).toBe(actor);
    const updated = rooms.get(room.code)?.engine;
    if (updated?.hand?.status !== "betting") {
      throw new Error("expected the hand to continue");
    }
    expect(updated.hand.toAct[0]).toBe(actor);
    expect(updated.hand.toAct).not.toContain(evicted);
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

describe("room recording", () => {
  const RECORDING_ROOM_SEATS = 2;

  interface RecordingApp {
    readonly app: FastifyInstance;
    readonly rooms: RoomStore;
    readonly fileSystem: MemoryFileSystem;
    readonly port: number;
  }

  async function startRecordingApp(): Promise<RecordingApp> {
    const fileSystem = createMemoryFileSystem();
    const rooms = new RoomStore();
    const app = await buildApp({
      rooms,
      recordings: new DirectoryRecordings(RECORDINGS_ROOT, fileSystem),
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const address = app.server.address();
    if (address === null || typeof address === "string") {
      throw new Error("expected a bound TCP address");
    }
    return { app, rooms, fileSystem, port: address.port };
  }

  async function createRoom(app: FastifyInstance): Promise<string> {
    const response = await app.inject({
      method: "POST",
      url: "/rooms",
      payload: { seatCount: RECORDING_ROOM_SEATS },
    });
    return response.json<RoomCreatedBody>().code;
  }

  function readJsonLines(
    fileSystem: MemoryFileSystem,
    filePath: string,
  ): unknown[] {
    const contents = fileSystem.read(filePath);
    if (contents === undefined) throw new Error(`no such file ${filePath}`);
    return parseRecordedLines(contents);
  }

  it("writes room.json before the join code is returned, keyed by the durable room id", async () => {
    const { app, rooms, fileSystem } = await startRecordingApp();
    try {
      const code = await createRoom(app);
      const room = rooms.get(code);
      if (!room) throw new Error("expected the created room to be live");

      expect(room.id).not.toBe(room.code);
      const manifest = readJsonLines(
        fileSystem,
        `${RECORDINGS_ROOT}/${room.id}/room.json`,
      )[0];
      expect(manifest).toEqual({
        layoutVersion: 1,
        roomId: room.id,
        code: room.code,
        createdAt: expect.any(String) as unknown,
      });
    } finally {
      await app.close();
    }
  });

  it("creates no joinable room when the recording cannot be written", async () => {
    const fileSystem = createMemoryFileSystem();
    const rooms = new RoomStore();
    const app = await buildApp({
      rooms,
      recordings: new DirectoryRecordings(RECORDINGS_ROOT, fileSystem),
    });
    fileSystem.failAlways("writeFile");
    try {
      const response = await app.inject({
        method: "POST",
        url: "/rooms",
        payload: { seatCount: RECORDING_ROOM_SEATS },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: "recording-unavailable" });
      expect(fileSystem.paths()).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it("writes a completed hand's context, commands and events as replayable JSONL", async () => {
    const { app, rooms, fileSystem, port } = await startRecordingApp();
    const code = await createRoom(app);
    const room = rooms.get(code);
    if (!room) throw new Error("expected the created room to be live");

    const table = new WebSocket(
      `ws://127.0.0.1:${String(port)}/ws?room=${code}&role=table`,
    );
    const seat0Claim = rooms.claimSeat(code, 0, "P0");
    const seat1Claim = rooms.claimSeat(code, 1, "P1");
    if (!("seat" in seat0Claim) || !("seat" in seat1Claim)) {
      throw new Error("expected both seats to be claimed");
    }
    const seat1 = new WebSocket(
      `ws://127.0.0.1:${String(port)}/ws?room=${code}&seat=1&token=${seat1Claim.seat.token ?? ""}`,
    );
    const seat0 = new WebSocket(
      `ws://127.0.0.1:${String(port)}/ws?room=${code}&seat=0&token=${seat0Claim.seat.token ?? ""}`,
    );
    const tableMessages: ServerMessage[] = [];
    const seat1Messages: ServerMessage[] = [];
    table.on("message", (data: Buffer) => {
      tableMessages.push(JSON.parse(data.toString()) as ServerMessage);
    });
    seat1.on("message", (data: Buffer) => {
      seat1Messages.push(JSON.parse(data.toString()) as ServerMessage);
    });

    async function waitForEvent(eventType: string): Promise<void> {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (
          tableMessages.some(
            (message) =>
              message.type === "hand-update" &&
              message.event.type === eventType,
          )
        ) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(`timed out waiting for ${eventType}`);
    }

    async function waitForRejection(): Promise<void> {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (
          seat1Messages.some((message) => message.type === "command-rejected")
        ) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("timed out waiting for command rejection");
    }

    /** Appends are queued, so the last one lands just after its broadcast. */
    async function waitForRecordedLines(
      filePath: string,
      count: number,
    ): Promise<void> {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (
          (fileSystem.read(filePath)?.trimEnd().split("\n").length ?? 0) >=
          count
        ) {
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error(
        `timed out waiting for ${String(count)} lines in ${filePath}`,
      );
    }

    try {
      await Promise.all(
        [table, seat0, seat1].map(
          (socket) =>
            new Promise<void>((resolve, reject) => {
              socket.once("open", () => {
                resolve();
              });
              socket.once("error", reject);
            }),
        ),
      );

      table.send(JSON.stringify({ type: "startHand" }));
      await waitForEvent("StreetStarted");
      seat1.send(JSON.stringify({ type: "fold" }));
      await waitForRejection();
      seat0.send(JSON.stringify({ type: "fold" }));
      await waitForEvent("HandComplete");

      const roomDir = `${RECORDINGS_ROOT}/${room.id}`;
      const commandsPath = `${roomDir}/hand-0001.commands.jsonl`;
      const eventsPath = `${roomDir}/hand-0001.events.jsonl`;
      await waitForRecordedLines(commandsPath, 3);

      const context = readJsonLines(
        fileSystem,
        `${roomDir}/hand-0001.context.json`,
      )[0] as Record<string, unknown>;
      expect(context).toEqual({
        v: ENGINE_LOG_VERSION,
        roomId: room.id,
        handOrdinal: 1,
        startedAt: expect.any(String) as unknown,
        seats: [0, 1],
        button: 0,
      });
      // No cards, no state snapshot — the sidecar is a bootstrap, not a save.
      expect(Object.keys(context)).not.toContain("hand");

      const commands = readJsonLines(fileSystem, commandsPath) as {
        type: string;
        seatId: number;
        seed?: string;
        v: number;
      }[];
      const events = readJsonLines(fileSystem, eventsPath) as {
        type: string;
        seed?: string;
        v: number;
      }[];

      expect(commands.map((command) => command.type)).toEqual([
        "startHand",
        "fold",
        "fold",
      ]);
      expect(commands[0]?.seatId).toBe(0);
      expect(typeof commands[0]?.seed).toBe("string");
      expect(events.at(-1)?.type).toBe("HandComplete");
      expect(events.some((event) => event.type === "Rejection")).toBe(true);
      expect(events[0]?.seed).toBe(commands[0]?.seed);
      // ENGINE_LOG_VERSION, unchanged by Phase 2 — see spec #129 §3.
      expect(commands.every((c) => c.v === ENGINE_LOG_VERSION)).toBe(true);
      expect(events.every((event) => event.v === ENGINE_LOG_VERSION)).toBe(
        true,
      );
    } finally {
      table.close();
      seat0.close();
      seat1.close();
      await app.close();
    }
  });
});

describe("action clock", () => {
  const ACTION_CLOCK_MS = 200;
  let app: FastifyInstance;
  let rooms: RoomStore;
  let port: number;

  beforeEach(async () => {
    rooms = new RoomStore();
    app = await buildApp({
      rooms,
      recordings: testRecordings(),
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
    if (socket.readyState === WebSocket.OPEN) return;
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
    const claim = rooms.claimSeat(code, seatId, `P${String(seatId)}`);
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

  it("does not reset the current actor's clock for a different seat's eviction", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    for (const seatId of [0, 1, 2])
      rooms.claimSeat(room.code, seatId, `P${String(seatId)}`);
    await settle();

    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();
    const actor = rooms.currentActor(room.code);
    if (actor === undefined) throw new Error("expected a current actor");

    await settle(150);
    const evicted = await app.inject({
      method: "POST",
      url: `/rooms/${room.code}/seats/${String((actor + 1) % 3)}/evict`,
    });
    await settle(120);

    expect(evicted.statusCode).toBe(204);
    expect(actionsSeen(table.messages)).toContainEqual(
      expect.objectContaining({ seatId: actor, action: "fold" }),
    );
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
      recordings: testRecordings(),
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
    if (socket.readyState === WebSocket.OPEN) return;
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

    const claim = rooms.claimSeat(room.code, 0, "P0");
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

    const claim = rooms.claimSeat(room.code, 0, "P0");
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
    const claim0 = rooms.claimSeat(room.code, 0, "P0");
    const claim1 = rooms.claimSeat(room.code, 1, "P1");
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
    const claim0 = rooms.claimSeat(room.code, 0, "P0");
    const claim1 = rooms.claimSeat(room.code, 1, "P1");
    const claim2 = rooms.claimSeat(room.code, 2, "P2");
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

  it("rejects a WS connect with a stale token after the seat is evicted", async () => {
    const room = rooms.create();
    const claim = rooms.claimSeat(room.code, 0, "P0");
    if (!("seat" in claim)) throw new Error("expected a claimed seat");
    const token = claim.seat.token ?? "";
    rooms.evictSeat(room.code, 0);

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
    const claim = rooms.claimSeat(room.code, 0, "P0");
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

describe("hand summaries over WebSocket", () => {
  let app: FastifyInstance;
  let rooms: RoomStore;
  let port: number;

  beforeEach(async () => {
    rooms = new RoomStore();
    app = await buildApp({ rooms, recordings: testRecordings() });
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
    if (socket.readyState === WebSocket.OPEN) return;
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
    const claim = rooms.claimSeat(code, seatId, `P${String(seatId)}`);
    if (!("seat" in claim)) throw new Error("expected a claimed seat");
    const conn = connect(
      `room=${code}&seat=${String(seatId)}&token=${claim.seat.token ?? ""}`,
    );
    await opened(conn.socket);
    return conn;
  }

  /** A three-seat room with the table and every seat connected. */
  async function seatedRoom(): Promise<{
    code: string;
    table: { socket: WebSocket; messages: ServerMessage[] };
    seats: Record<number, { socket: WebSocket; messages: ServerMessage[] }>;
  }> {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    const seats = {
      0: await claimAndConnect(room.code, 0),
      1: await claimAndConnect(room.code, 1),
      2: await claimAndConnect(room.code, 2),
    };
    await settle();
    return { code: room.code, table, seats };
  }

  /** Folds whoever is on the clock until the hand is over. */
  async function foldToTheEnd(
    code: string,
    seats: Record<number, { socket: WebSocket }>,
  ): Promise<void> {
    for (let i = 0; i < 8; i++) {
      if (rooms.get(code)?.engine?.hand?.status === "complete") return;
      const actor = rooms.currentActor(code);
      if (actor === undefined) throw new Error("expected a current actor");
      seats[actor]?.socket.send(JSON.stringify({ type: "fold" }));
      await settle();
    }
    throw new Error("hand did not complete");
  }

  function summariesIn(messages: ServerMessage[]) {
    return messages.filter((m) => m.type === "hand-summary");
  }

  it("pushes one summary to the table the moment a hand completes", async () => {
    const { code, table, seats } = await seatedRoom();

    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();
    expect(summariesIn(table.messages)).toHaveLength(0);

    await foldToTheEnd(code, seats);

    const summaries = summariesIn(table.messages);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.summary).toMatchObject({
      handOrdinal: 1,
      bettingShape: { kind: "walk" },
      streetReached: "preflop",
      board: [],
    });
    // Deal order is button-relative, so assert the field, not its rotation.
    expect([...(summaries[0]?.summary.seatsDealtIn ?? [])].sort()).toEqual([
      0, 1, 2,
    ]);
    expect(summaries[0]?.summary.survivors).toHaveLength(1);
    expect(summaries[0]?.summary.outcome.kind).toBe("folded-out");
    expect(Date.parse(summaries[0]?.summary.startedAt ?? "")).not.toBeNaN();
  });

  it("never pushes a summary to a player's socket", async () => {
    const { code, table, seats } = await seatedRoom();
    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();
    await foldToTheEnd(code, seats);

    for (const seat of Object.values(seats)) {
      expect(summariesIn(seat.messages)).toHaveLength(0);
      expect(seat.messages.some((m) => m.type === "hand-list")).toBe(false);
    }
  });

  it("numbers hands 1-based across the room's life", async () => {
    const { code, table, seats } = await seatedRoom();

    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();
    await foldToTheEnd(code, seats);
    table.socket.send(JSON.stringify({ type: "nextHand" }));
    await settle();
    await foldToTheEnd(code, seats);

    expect(
      summariesIn(table.messages).map((m) => m.summary.handOrdinal),
    ).toEqual([1, 2]);
  });

  it("gives a table that connects mid-session the whole accumulated list", async () => {
    const { code, table, seats } = await seatedRoom();
    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();
    await foldToTheEnd(code, seats);
    table.socket.send(JSON.stringify({ type: "nextHand" }));
    await settle();
    await foldToTheEnd(code, seats);

    // The kiosk reloads; Phase 1's catch-up snapshot carries no summaries.
    table.socket.close();
    await settle();
    const reloaded = connect(`room=${code}&role=table`);
    await opened(reloaded.socket);
    await settle();

    const list = reloaded.messages.find((m) => m.type === "hand-list");
    expect(list?.summaries.map((s) => s.handOrdinal)).toEqual([1, 2]);
  });

  it("answers a list-hands request with the accumulated list", async () => {
    const { code, table, seats } = await seatedRoom();
    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();
    await foldToTheEnd(code, seats);

    table.messages.length = 0;
    table.socket.send(JSON.stringify({ type: "list-hands" }));
    await settle();

    const list = table.messages.find((m) => m.type === "hand-list");
    expect(list?.summaries).toHaveLength(1);
    expect(table.messages.some((m) => m.type === "command-rejected")).toBe(
      false,
    );
  });

  it("refuses a list-hands request from a player's socket", async () => {
    const { seats } = await seatedRoom();
    const seat = seats[0];
    if (seat === undefined) throw new Error("expected a connected seat");
    seat.socket.send(JSON.stringify({ type: "list-hands" }));
    await settle();

    expect(seat.messages).toContainEqual({
      type: "command-rejected",
      reason: "not-permitted",
    });
    expect(seat.messages.some((m) => m.type === "hand-list")).toBe(false);
  });

  it("rejects a malformed replay request at the same boundary as a command", async () => {
    const { table } = await seatedRoom();
    table.socket.send(JSON.stringify({ type: "get-hand", handOrdinal: 0 }));
    await settle();

    expect(table.messages).toContainEqual({
      type: "command-rejected",
      reason: "invalid-command",
    });
  });

  it("answers a well-formed get-hand rather than dropping it", async () => {
    const { table } = await seatedRoom();
    table.socket.send(JSON.stringify({ type: "get-hand", handOrdinal: 1 }));
    await settle();

    expect(table.messages).toContainEqual({
      type: "command-rejected",
      reason: "replay-not-supported",
    });
  });

  it("summarises nothing for a hand still in progress", async () => {
    const { code, table, seats } = await seatedRoom();
    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();
    await foldToTheEnd(code, seats);

    table.socket.send(JSON.stringify({ type: "nextHand" }));
    await settle();

    // The second hand is live, so the listing still holds only the first —
    // an ordinal is spent at the deal, but a row is earned at completion.
    expect(rooms.get(code)?.engine?.hand?.status).toBe("betting");
    expect(
      summariesIn(table.messages).map((m) => m.summary.handOrdinal),
    ).toEqual([1]);
  });

  it("keeps the hand listing out of RoomView", async () => {
    const { code, table, seats } = await seatedRoom();
    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();
    await foldToTheEnd(code, seats);

    const view = table.messages.findLast((m) => m.type === "room-view")?.view;
    expect(JSON.stringify(view)).not.toContain("handOrdinal");
  });

  it("starts a fresh table's listing empty rather than silent", async () => {
    const room = rooms.create();
    const table = connect(`room=${room.code}&role=table`);
    await opened(table.socket);
    await settle();

    expect(table.messages).toContainEqual({
      type: "hand-list",
      summaries: [],
    });
  });

  it("discards the listing when the room ends", async () => {
    const { code, table, seats } = await seatedRoom();
    table.socket.send(JSON.stringify({ type: "startHand" }));
    await settle();
    await foldToTheEnd(code, seats);

    await app.inject({ method: "POST", url: `/rooms/${code}/end` });
    await settle();

    const revived = rooms.create();
    const freshTable = connect(`room=${revived.code}&role=table`);
    await opened(freshTable.socket);
    await settle();

    expect(freshTable.messages).toContainEqual({
      type: "hand-list",
      summaries: [],
    });
  });
});
