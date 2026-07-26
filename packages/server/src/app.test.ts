import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";
import { buildApp } from "./app.js";

interface RoomCodeBody {
  readonly code: string;
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

  it("joining a known room code succeeds", async () => {
    const created = await app.inject({ method: "POST", url: "/rooms" });
    const { code } = created.json<RoomCodeBody>();

    const joined = await app.inject({
      method: "POST",
      url: `/rooms/${code}/join`,
    });
    expect(joined.statusCode).toBe(200);
    expect(joined.json<RoomCodeBody>()).toEqual({ code });
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
    const { code } = created.json<RoomCodeBody>();

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
    const { code } = created.json<RoomCodeBody>();

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

describe("WebSocket upgrade", () => {
  let app: FastifyInstance;
  let port: number;

  beforeEach(async () => {
    app = await buildApp();
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

  it("accepts a bare WebSocket connection on the same port as HTTP", async () => {
    const socket = new WebSocket(`ws://127.0.0.1:${String(port)}/ws`);
    await new Promise<void>((resolve, reject) => {
      socket.on("open", resolve);
      socket.on("error", reject);
    });
    expect(socket.readyState).toBe(WebSocket.OPEN);
    socket.close();
  });
});
