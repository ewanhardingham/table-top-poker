import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import type { ServerMessage } from "@table-top-poker/protocol";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { WebSocket } from "ws";
import { joinUrl, roomQrCodeDataUrl } from "./qr.js";
import {
  type ClaimSeatError,
  type Room,
  RoomStore,
  toRoomView,
} from "./rooms.js";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const publicIndexPath = fileURLToPath(
  new URL("../public/index.html", import.meta.url),
);

export interface BuildAppOptions {
  readonly rooms?: RoomStore;
}

interface RoomCodeRoute {
  Params: { code: string };
}

interface RoomSeatRoute {
  Params: { code: string; seatId: string };
}

interface WsRoute {
  Querystring: {
    room?: string;
    role?: string;
    seat?: string;
    token?: string;
  };
}

const CLAIM_ERROR_STATUS: Record<ClaimSeatError, number> = {
  "room-not-found": 404,
  "seat-not-found": 404,
  "seat-already-claimed": 409,
};

/** Looks up a room, replying 404 and returning undefined when it's not live. */
function findRoomOrReject(
  rooms: RoomStore,
  code: string,
  reply: FastifyReply,
): Room | undefined {
  const room = rooms.get(code);
  if (!room) {
    void reply.code(404).send({ error: "room-not-found" });
    return undefined;
  }
  return room;
}

/** Seat ids arrive as route/query strings — reject anything that isn't a bare integer. */
function parseSeatId(raw: string): number | undefined {
  return /^\d+$/.test(raw) ? Number(raw) : undefined;
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const rooms = options.rooms ?? new RoomStore();
  const roomSockets = new Map<string, Set<WebSocket>>();
  const app = Fastify();

  function broadcastRoomView(code: string): void {
    const room = rooms.get(code);
    const sockets = roomSockets.get(code);
    if (!room || !sockets) return;
    const message: ServerMessage = {
      type: "room-view",
      view: toRoomView(room),
    };
    const payload = JSON.stringify(message);
    for (const socket of sockets) {
      socket.send(payload);
    }
  }

  await app.register(fastifyStatic, { root: publicDir });
  await app.register(fastifyWebsocket);

  app.post("/rooms", async (request) => {
    const room = rooms.create();
    const url = joinUrl(request.headers.host ?? "localhost", room.code);
    const qrCodeDataUrl = await roomQrCodeDataUrl(url);
    return { code: room.code, joinUrl: url, qrCodeDataUrl };
  });

  app.post<RoomCodeRoute>("/rooms/:code/join", (request, reply) => {
    const room = findRoomOrReject(rooms, request.params.code, reply);
    if (!room) return;
    return toRoomView(room);
  });

  app.get<RoomCodeRoute>("/rooms/:code/qr", async (request, reply) => {
    const room = findRoomOrReject(rooms, request.params.code, reply);
    if (!room) return;
    const url = joinUrl(request.headers.host ?? "localhost", room.code);
    const dataUrl = await roomQrCodeDataUrl(url);
    return { url, dataUrl };
  });

  app.post<RoomCodeRoute>("/rooms/:code/end", (request, reply) => {
    const room = findRoomOrReject(rooms, request.params.code, reply);
    if (!room) return;
    rooms.end(room.code);
    return reply.code(204).send();
  });

  /**
   * Where the QR code's join URL lands. `PLAYER_CLIENT_ORIGIN` points dev at
   * the player-client's own Vite server; unset, it serves the (currently
   * placeholder) same-origin index — ticket 34 bundles the real app there.
   */
  app.get<RoomCodeRoute>("/join/:code", (request, reply) => {
    const room = findRoomOrReject(rooms, request.params.code, reply);
    if (!room) return;
    const playerOrigin = process.env.PLAYER_CLIENT_ORIGIN;
    if (playerOrigin) {
      return reply.redirect(`${playerOrigin}/join/${room.code}`);
    }
    return reply.type("text/html").send(readFileSync(publicIndexPath));
  });

  app.post<RoomSeatRoute>(
    "/rooms/:code/seats/:seatId/claim",
    (request, reply) => {
      const seatId = parseSeatId(request.params.seatId);
      if (seatId === undefined) {
        return reply.code(400).send({ error: "invalid-seat-id" });
      }
      const result = rooms.claimSeat(request.params.code, seatId);
      if ("error" in result) {
        return reply
          .code(CLAIM_ERROR_STATUS[result.error])
          .send({ error: result.error });
      }
      broadcastRoomView(request.params.code);
      return {
        seatId: result.seat.id,
        token: result.seat.token,
        sittingOut: result.seat.sittingOut,
      };
    },
  );

  app.post<RoomSeatRoute>(
    "/rooms/:code/seats/:seatId/clear",
    (request, reply) => {
      const seatId = parseSeatId(request.params.seatId);
      if (seatId === undefined) {
        return reply.code(400).send({ error: "invalid-seat-id" });
      }
      const room = findRoomOrReject(rooms, request.params.code, reply);
      if (!room) return;
      rooms.clearSeat(request.params.code, seatId);
      broadcastRoomView(request.params.code);
      return reply.code(204).send();
    },
  );

  app.register((wsApp, _opts, done) => {
    wsApp.get<WsRoute>(
      "/ws",
      {
        websocket: true,
        preValidation: async (request, reply) => {
          const { room: code, role, seat, token } = request.query;
          if (!code) {
            await reply.code(400).send({ error: "room-required" });
            return;
          }
          const room = rooms.get(code);
          if (!room) {
            await reply.code(404).send({ error: "room-not-found" });
            return;
          }
          if (role === "table") return;

          const seatId = seat === undefined ? undefined : parseSeatId(seat);
          const seatObj = seatId === undefined ? undefined : room.seats[seatId];
          if (
            !seatObj ||
            !seatObj.claimed ||
            token === undefined ||
            seatObj.token !== token
          ) {
            await reply.code(403).send({ error: "invalid-seat-token" });
            return;
          }
        },
      },
      (socket, request) => {
        const code = request.query.room;
        if (code === undefined) return;

        let sockets = roomSockets.get(code);
        if (!sockets) {
          sockets = new Set();
          roomSockets.set(code, sockets);
        }
        sockets.add(socket);

        const room = rooms.get(code);
        if (room) {
          const message: ServerMessage = {
            type: "room-view",
            view: toRoomView(room),
          };
          socket.send(JSON.stringify(message));
        }

        socket.on("close", () => {
          sockets.delete(socket);
        });
      },
    );
    done();
  });

  return app;
}
