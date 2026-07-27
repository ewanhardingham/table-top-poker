import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import {
  ClientCommandSchema,
  view,
  type CommandRejectedMessage,
  type HandEvent,
  type SeatId,
  type ServerMessage,
} from "@table-top-poker/protocol";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { WebSocket } from "ws";
import { ActionClock } from "./action-clock.js";
import { joinUrl, roomQrCodeDataUrl } from "./qr.js";
import {
  type ClaimSeatError,
  type DispatchStep,
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
  /** Overridable for tests only; production runs `ActionClock`'s 90s default. */
  readonly actionClockMs?: number;
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

/**
 * `HandEvent` is the engine's full, unredacted truth by design (secrecy
 * lives solely in `view` — docs/phase-1-spec.md §3/§4). The *wire* event
 * carried alongside that view is a transport-level exception: `HoleCardsDealt`
 * must be redacted per recipient before it ever leaves the server, or the
 * "raw event for audit/animation" bullet in §6 would leak every seat's cards
 * to every socket regardless of what `view` shows.
 */
function redactEventFor(
  event: HandEvent,
  identity: SeatId | "table",
): HandEvent {
  if (event.type !== "HoleCardsDealt") return event;
  return {
    ...event,
    deals:
      identity === "table"
        ? []
        : event.deals.filter((deal) => deal.seatId === identity),
  };
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
  const socketIdentity = new Map<WebSocket, SeatId | "table">();
  const actionClock = new ActionClock(options.actionClockMs);
  const app = Fastify();

  function send(socket: WebSocket, message: ServerMessage): void {
    socket.send(JSON.stringify(message));
  }

  function sendRejection(
    socket: WebSocket,
    reason: CommandRejectedMessage["reason"],
  ): void {
    send(socket, { type: "command-rejected", reason });
  }

  function broadcastRoomView(code: string): void {
    const room = rooms.get(code);
    const sockets = roomSockets.get(code);
    if (!room || !sockets) return;
    const message: ServerMessage = {
      type: "room-view",
      view: toRoomView(room),
    };
    for (const socket of sockets) {
      send(socket, message);
    }
  }

  /**
   * Fans one event out to every socket in the room, per-recipient: the
   * table gets `view(state, 'table')`, a seat gets `view(state, seatId)`
   * only if it was actually dealt into the hand that produced this state —
   * a sitting-out seat's socket gets nothing, never another seat's cards
   * (docs/phase-1-spec.md §4, §6).
   */
  function fanOutHandUpdate(code: string, step: DispatchStep): void {
    const sockets = roomSockets.get(code);
    if (!sockets) return;
    for (const socket of sockets) {
      const identity = socketIdentity.get(socket);
      if (identity === undefined) continue;
      if (identity === "table") {
        send(socket, {
          type: "hand-update",
          event: redactEventFor(step.event, "table"),
          view: view(step.state, "table"),
        });
      } else if (step.state.seats.includes(identity)) {
        send(socket, {
          type: "hand-update",
          event: redactEventFor(step.event, identity),
          view: view(step.state, identity),
        });
      }
    }
  }

  /**
   * Re-arms the room's action clock against whoever is now on the clock —
   * called after every command a room accepts, real or synthesized, so the
   * clock always reflects the live actor. A disconnected socket plays no
   * part here; only `dispatch` outcomes move this clock, per
   * docs/phase-1-spec.md §7.
   */
  function rescheduleActionClock(code: string): void {
    const actor = rooms.currentActor(code);
    if (actor === undefined) {
      actionClock.clear(code);
      return;
    }
    actionClock.schedule(code, () => {
      const result = rooms.dispatch(code, actor, "fold");
      // `actor` was read as the live current actor at schedule time, and
      // any real action in between would have rescheduled (and thus
      // replaced) this very timer — so `dispatch` rejecting the
      // synthesized fold isn't expected to happen. `for` runs zero times
      // if it somehow does, and the clock still re-arms below.
      if ("steps" in result) {
        for (const step of result.steps) {
          fanOutHandUpdate(code, step);
        }
      }
      rescheduleActionClock(code);
    });
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
    actionClock.clear(room.code);
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

        const { role, seat } = request.query;
        let identity: SeatId | "table";
        if (role === "table") {
          identity = "table";
        } else {
          const seatId = seat === undefined ? undefined : parseSeatId(seat);
          if (seatId === undefined) return;
          identity = seatId;
        }
        socketIdentity.set(socket, identity);

        let sockets = roomSockets.get(code);
        if (!sockets) {
          sockets = new Set();
          roomSockets.set(code, sockets);
        }
        sockets.add(socket);

        const room = rooms.get(code);
        if (room) {
          send(socket, { type: "room-view", view: toRoomView(room) });
        }

        socket.on("message", (data: Buffer) => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(data.toString());
          } catch {
            sendRejection(socket, "invalid-command");
            return;
          }

          const parseResult = ClientCommandSchema.safeParse(parsed);
          if (!parseResult.success) {
            sendRejection(socket, "invalid-command");
            return;
          }

          const dispatchResult = rooms.dispatch(
            code,
            identity,
            parseResult.data.type,
          );
          if ("error" in dispatchResult) {
            sendRejection(socket, dispatchResult.error);
            return;
          }
          if ("reason" in dispatchResult) {
            sendRejection(socket, dispatchResult.reason);
            return;
          }

          for (const step of dispatchResult.steps) {
            fanOutHandUpdate(code, step);
          }
          rescheduleActionClock(code);
          if (parseResult.data.type === "startHand") {
            broadcastRoomView(code);
          }
        });

        socket.on("close", () => {
          sockets.delete(socket);
          socketIdentity.delete(socket);
        });
      },
    );
    done();
  });

  return app;
}
