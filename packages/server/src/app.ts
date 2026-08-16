import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import {
  AddBotsRequestSchema,
  ChangeSeatCountRequestSchema,
  ChangeSoundSettingsRequestSchema,
  ClaimSeatRequestSchema,
  LeaveSeatRequestSchema,
  ClientCommandSchema,
  CreateRoomRequestSchema,
  view,
  type CommandRejectedMessage,
  type HandEvent,
  isHandComplete,
  type SeatId,
  type SeatCountChangeError,
  type SeatMove,
  type ServerMessage,
} from "@table-top-poker/protocol";
import { HandLog } from "@table-top-poker/persistence";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { WebSocket } from "ws";
import { ActionClock } from "./action-clock.js";
import { joinUrl, roomQrCodeDataUrl } from "./qr.js";
import {
  type ClaimSeatError,
  type DispatchRejection,
  type DispatchStep,
  type DispatchSuccess,
  type Room,
  RoomStore,
  toRoomView,
} from "./rooms.js";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const publicIndexPath = fileURLToPath(
  new URL("../public/index.html", import.meta.url),
);
/**
 * A release build (ticket 34's `build:release` script) stages the real
 * table/player apps here, under their own subpath so each is servable at
 * its own base URL from the same origin; unstaged (dev, tests, a checkout
 * that hasn't run the release script), these don't exist and every route
 * below falls back to `publicIndexPath`'s placeholder.
 */
const publicTableIndexPath = fileURLToPath(
  new URL("../public/table/index.html", import.meta.url),
);
const publicPlayerIndexPath = fileURLToPath(
  new URL("../public/player/index.html", import.meta.url),
);

function readIndexOr(stagedPath: string): Buffer {
  return readFileSync(existsSync(stagedPath) ? stagedPath : publicIndexPath);
}

export interface BuildAppOptions {
  readonly rooms?: RoomStore;
  /** Root directory for append-as-you-go per-game hand logs. */
  readonly handLogDir?: string;
  /** Enables test-only server features such as bot players. */
  readonly testMode?: boolean;
  /** Overridable for tests only; production runs `ActionClock`'s 90s default. */
  readonly actionClockMs?: number;
  /** How often the server pings every open socket (Phase 1 spec #130 §7). */
  readonly pingIntervalMs?: number;
  /** Missed pongs before a seat's badge flips to "disconnected". */
  readonly missedPongLimit?: number;
  /** How long the table device's own socket may stay down before the room ends. */
  readonly graceWindowMs?: number;
}

interface RoomCodeRoute {
  Params: { code: string };
}

interface RoomSeatRoute {
  Params: { code: string; seatId: string };
}

/**
 * The two roles that skip seat-token authentication, kept in one place so the
 * set of unauthenticated connections is reviewable at a glance: `table` is the
 * shared table device, `lobby` is an unclaimed player watching the room view.
 * Anything else must present a seat token.
 */
const UNAUTHENTICATED_ROLES = ["table", "lobby"] as const;
type UnauthenticatedRole = (typeof UNAUTHENTICATED_ROLES)[number];

function isUnauthenticatedRole(
  role: string | undefined,
): role is UnauthenticatedRole {
  return UNAUTHENTICATED_ROLES.includes(role as UnauthenticatedRole);
}

interface WsRoute {
  Querystring: {
    room?: string;
    role?: string;
    seat?: string;
    token?: string;
  };
}

type SocketIdentity = SeatId | "table" | "lobby";
type ActionClockPolicy = "reschedule" | "preserve";

/**
 * Narrows a socket's identity to a seat. Only a seat may be handed
 * `view(state, seatId)` or have its presence tracked; the table and lobby
 * identities are deliberately excluded, so every per-seat path goes through
 * this one guard rather than its own `!== "lobby"` check.
 */
function isSeat(identity: SocketIdentity | undefined): identity is SeatId {
  return identity !== undefined && identity !== "table" && identity !== "lobby";
}

const CLAIM_ERROR_STATUS: Record<ClaimSeatError, number> = {
  "room-not-found": 404,
  "seat-not-found": 404,
  "seat-already-claimed": 409,
  "invalid-display-name": 400,
  "duplicate-display-name": 409,
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
 * lives solely in `view` — Phase 1 spec #130 §3/§4). The *wire* event
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

interface AuthenticatedSeat {
  readonly identity: SeatId;
  readonly movedFrom: SeatId | undefined;
}

function authenticateSeat(
  rooms: RoomStore,
  code: string,
  query: WsRoute["Querystring"],
): AuthenticatedSeat | undefined {
  const requestedSeat =
    query.seat === undefined ? undefined : parseSeatId(query.seat);
  const seat =
    query.token === undefined
      ? undefined
      : rooms.findSeatByToken(code, query.token);
  if (requestedSeat === undefined || seat === undefined) return undefined;
  return {
    identity: seat.id,
    movedFrom: requestedSeat === seat.id ? undefined : requestedSeat,
  };
}

function seatCountBodyError(
  issues: readonly { readonly path: readonly PropertyKey[] }[],
): Extract<
  SeatCountChangeError,
  "invalid-request-body" | "invalid-seat-count"
> {
  return issues.some((issue) => issue.path[0] === "seatCount")
    ? "invalid-seat-count"
    : "invalid-request-body";
}

export async function buildApp(
  options: BuildAppOptions = {},
): Promise<FastifyInstance> {
  const rooms = options.rooms ?? new RoomStore();
  const handLogs = new Map<string, HandLog>();
  const testMode = options.testMode ?? false;
  const pingIntervalMs = options.pingIntervalMs ?? 10_000;
  const missedPongLimit = options.missedPongLimit ?? 2;
  const graceWindowMs = options.graceWindowMs ?? 60_000;
  const roomSockets = new Map<string, Set<WebSocket>>();
  const socketIdentity = new Map<WebSocket, SocketIdentity>();
  const actionClock = new ActionClock(options.actionClockMs);
  const socketRoomCode = new Map<WebSocket, string>();
  const pingMissed = new Map<WebSocket, number>();
  const evictedSockets = new WeakSet<WebSocket>();
  /** One timer per room, armed the moment its table-role socket closes. */
  const tableGraceTimers = new Map<string, NodeJS.Timeout>();
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

  /** Refreshes the displayed completed hand after an immediate between-hand repack. */
  function broadcastDisplayedHand(code: string): void {
    const room = rooms.get(code);
    const sockets = roomSockets.get(code);
    if (!room?.engine || !sockets || !isHandComplete(room.engine)) return;
    for (const socket of sockets) {
      const identity = socketIdentity.get(socket);
      if (identity === undefined) continue;
      if (identity === "table") {
        send(socket, {
          type: "view-snapshot",
          view: view(room.engine, "table"),
        });
      } else if (isSeat(identity) && room.engine.seats.includes(identity)) {
        send(socket, {
          type: "view-snapshot",
          view: view(room.engine, identity),
        });
      }
    }
  }

  /**
   * Applies a positional repack to every currently open player socket before
   * the new room view or hand snapshot is sent. The token stays with the
   * player, while this transport identity follows the moved seat.
   */
  function applySeatMoves(code: string, moves: readonly SeatMove[]): void {
    const sockets = roomSockets.get(code);
    if (!sockets) return;
    for (const move of moves) {
      for (const socket of sockets) {
        if (socketIdentity.get(socket) !== move.from) continue;
        socketIdentity.set(socket, move.to);
        send(socket, { type: "seat-moved", from: move.from, to: move.to });
      }
    }
  }

  /**
   * A seat token only protects the next connection attempt. Remove all
   * currently open sockets for an evicted seat too, otherwise that socket
   * could keep issuing commands until it disconnected on its own.
   *
   * `notify` sends the `player-evicted` notice; a voluntary leave (ADR-0005)
   * passes `false`, since it isn't an eviction and its client has already
   * torn itself down. Either way the socket is flagged so its own close
   * handler skips the disconnected-presence toggle on the freed seat.
   */
  function closeSeatSockets(code: string, seatId: SeatId, notify = true): void {
    const sockets = roomSockets.get(code);
    if (!sockets) return;

    for (const socket of [...sockets]) {
      if (socketIdentity.get(socket) !== seatId) continue;
      evictedSockets.add(socket);
      if (notify) send(socket, { type: "player-evicted" });
      sockets.delete(socket);
      socketIdentity.delete(socket);
      socketRoomCode.delete(socket);
      pingMissed.delete(socket);
      socket.close();
    }
  }

  /** Cosmetic presence toggle for a seat's socket — never touches `rooms.dispatch`. */
  function markPresence(socket: WebSocket, disconnected: boolean): void {
    const identity = socketIdentity.get(socket);
    const code = socketRoomCode.get(socket);
    if (!isSeat(identity) || code === undefined) return;
    rooms.setSeatDisconnected(code, identity, disconnected);
    broadcastRoomView(code);
  }

  /**
   * Ends a room the same way whether triggered by "End session" or the
   * table device's own reconnect grace window elapsing (Phase 1 spec #130
   * §7): notify every socket, close them, discard the transport bookkeeping,
   * then discard the room itself. Hand logs on disk are untouched — this
   * only ever touches in-memory state.
   */
  function endRoom(code: string): void {
    const sockets = roomSockets.get(code);
    if (sockets) {
      for (const socket of sockets) {
        send(socket, { type: "room-ended" });
        socket.close();
        socketIdentity.delete(socket);
        socketRoomCode.delete(socket);
        pingMissed.delete(socket);
      }
      roomSockets.delete(code);
    }
    const timer = tableGraceTimers.get(code);
    if (timer) {
      clearTimeout(timer);
      tableGraceTimers.delete(code);
    }
    actionClock.clear(code);
    handLogs.delete(code);
    rooms.end(code);
  }

  /** Persists the exact engine command and resulting events for replay/audit. */
  function logDispatch(
    code: string,
    result: DispatchRejection | DispatchSuccess,
  ): void {
    if (options.handLogDir === undefined) return;
    if (result.command === undefined) return;
    const room = rooms.get(code);
    const seats = room?.engine?.seats;
    if (room === undefined || seats === undefined) return;

    let log = handLogs.get(code);
    if (log === undefined) {
      log = new HandLog(options.handLogDir, code, seats);
      handLogs.set(code, log);
    }
    if ("steps" in result) {
      const startsHand = result.steps.some(
        (step) => step.event.type === "HandStarted",
      );
      log.logCommand(result.command, startsHand);
      for (const step of result.steps) log.logEvent(step.event);
    } else if (result.rejection !== undefined) {
      log.logCommand(result.command, false);
      log.logEvent(result.rejection);
    }
  }

  const pingTimer = setInterval(() => {
    for (const socket of pingMissed.keys()) {
      const missed = (pingMissed.get(socket) ?? 0) + 1;
      pingMissed.set(socket, missed);
      if (missed === missedPongLimit) {
        markPresence(socket, true);
      }
      try {
        socket.ping();
      } catch {
        // Socket is already on its way down; its 'close' handler cleans up.
      }
    }
  }, pingIntervalMs);

  app.addHook("onClose", (_instance, done) => {
    clearInterval(pingTimer);
    for (const timer of tableGraceTimers.values()) clearTimeout(timer);
    done();
  });

  /**
   * Fans one event out to every socket in the room, per-recipient: the
   * table gets `view(state, 'table')`, a seat gets `view(state, seatId)`
   * only if it was actually dealt into the hand that produced this state —
   * a sitting-out seat's socket gets nothing, never another seat's cards
   * (Phase 1 spec #130 §4, §6).
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
      } else if (isSeat(identity) && step.state.seats.includes(identity)) {
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
   * Phase 1 spec #130 §7.
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
      // synthesized fold isn't expected to happen. If it somehow does, the
      // clock still re-arms below.
      if ("steps" in result) {
        publishDispatch(code, result);
        return;
      }
      rescheduleActionClock(code);
    });
  }

  /** Publishes an accepted dispatch, including any positional seat moves. */
  function publishDispatch(
    code: string,
    result: DispatchSuccess,
    options: {
      readonly actionClock?: ActionClockPolicy;
    } = {},
  ): void {
    if (result.seatMoves !== undefined) {
      applySeatMoves(code, result.seatMoves);
    }
    logDispatch(code, result);
    for (const step of result.steps) {
      fanOutHandUpdate(code, step);
    }
    if (options.actionClock === "preserve") {
      if (rooms.currentActor(code) === undefined) actionClock.clear(code);
    } else {
      rescheduleActionClock(code);
    }
  }

  // `index: false` — the explicit "/" route below owns index resolution
  // (placeholder vs. a staged table build), so the static plugin only ever
  // serves fingerprinted assets (`/table/assets/*`, `/player/assets/*`),
  // never racing its own directory-index behaviour against that route.
  await app.register(fastifyStatic, { root: publicDir, index: false });
  await app.register(fastifyWebsocket);

  app.get("/", (_request, reply) => {
    // The HTML shell names the current fingerprinted bundle, so it must never
    // be cached: a stale shell pins a long-lived kiosk to an old build even
    // across app restarts (the disk cache survives them). `no-store` forces a
    // fresh shell every load; the hashed assets it points at stay cacheable.
    return reply
      .type("text/html")
      .header("cache-control", "no-store")
      .send(readIndexOr(publicTableIndexPath));
  });

  app.get("/config", () => ({ testMode }));

  app.post("/rooms", async (request, reply) => {
    // The table client picks a seat count (issue #74); this is the trust
    // boundary that decides whether it's a size a room may actually have.
    const body = CreateRoomRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: seatCountBodyError(body.error.issues),
      });
    }

    const room = rooms.create(body.data.seatCount);
    const url = joinUrl(request.headers.host ?? "localhost", room.code);
    const qrCodeDataUrl = await roomQrCodeDataUrl(url);
    return { code: room.code, joinUrl: url, qrCodeDataUrl };
  });

  /**
   * Test-mode table action: fill existing free seats with virtual players.
   * Keeping this route out of the Fastify registration entirely when the gate
   * is off makes the production surface a plain 404.
   */
  if (testMode) {
    app.post<RoomCodeRoute>("/rooms/:code/bots", (request, reply) => {
      const body = AddBotsRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid-request-body" });
      }

      const room = findRoomOrReject(rooms, request.params.code, reply);
      if (!room) return;
      const result = rooms.addBots(room.code, body.data.count);
      if ("error" in result) {
        return reply.code(404).send({ error: result.error });
      }

      broadcastRoomView(room.code);
      return { joined: result.seats.length };
    });
  }

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
    endRoom(room.code);
    return reply.code(204).send();
  });

  /**
   * Table-device house rules: change the room's seat count (issue #77). The
   * HTTP boundary is intentionally the same ungated table-action boundary as
   * `/end` and `/evict`; role authentication is not part of this transport.
   */
  const changeSeatCount = (
    request: FastifyRequest<RoomCodeRoute>,
    reply: FastifyReply,
  ) => {
    const body = ChangeSeatCountRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: seatCountBodyError(body.error.issues),
      });
    }

    const room = findRoomOrReject(rooms, request.params.code, reply);
    if (!room) return;
    const result = rooms.changeSeatCount(room.code, body.data.seatCount);
    if ("error" in result) {
      if (result.error === "seat-count-below-floor") {
        return reply.code(400).send({
          error: result.error,
          minimum: result.minimum,
        });
      }
      return reply.code(400).send({ error: result.error });
    }

    applySeatMoves(room.code, result.moves);
    broadcastRoomView(room.code);
    if (result.moves.length > 0) broadcastDisplayedHand(room.code);
    return result;
  };

  app.post<RoomCodeRoute>("/rooms/:code/seats/count", changeSeatCount);

  /**
   * Table-device sound settings (#182): the room-wide
   * master/cards/actions/notifications toggles. Same ungated table-action
   * boundary as `/seats/count` — the table
   * owns these and pushes them to every surface via the broadcast `room-view`.
   */
  app.post<RoomCodeRoute>("/rooms/:code/sound", (request, reply) => {
    const body = ChangeSoundSettingsRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid-request-body" });
    }
    const room = findRoomOrReject(rooms, request.params.code, reply);
    if (!room) return;
    const result = rooms.changeSoundSettings(room.code, body.data);
    if ("error" in result) {
      return reply.code(404).send({ error: result.error });
    }
    broadcastRoomView(room.code);
    return result;
  });

  /**
   * Where the QR code's join URL lands. `PLAYER_CLIENT_ORIGIN` points dev at
   * the player-client's own Vite server; unset, it serves a release build
   * staged at `public/player` (ticket 34's `build:release`), or the
   * placeholder if none has been staged.
   */
  app.get<RoomCodeRoute>("/join/:code", (request, reply) => {
    const room = findRoomOrReject(rooms, request.params.code, reply);
    if (!room) return;
    const playerOrigin = process.env.PLAYER_CLIENT_ORIGIN;
    if (playerOrigin) {
      return reply.redirect(`${playerOrigin}/join/${room.code}`);
    }
    // See the table shell above: never cache the HTML that names the bundle.
    return reply
      .type("text/html")
      .header("cache-control", "no-store")
      .send(readIndexOr(publicPlayerIndexPath));
  });

  app.post<RoomSeatRoute>(
    "/rooms/:code/seats/:seatId/claim",
    (request, reply) => {
      const seatId = parseSeatId(request.params.seatId);
      if (seatId === undefined) {
        return reply.code(400).send({ error: "invalid-seat-id" });
      }
      const body = ClaimSeatRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid-display-name" });
      }
      const result = rooms.claimSeat(
        request.params.code,
        seatId,
        body.data.displayName,
      );
      if ("error" in result) {
        return reply
          .code(CLAIM_ERROR_STATUS[result.error])
          .send({ error: result.error });
      }
      broadcastRoomView(request.params.code);
      return {
        seatId: result.seat.id,
        token: result.seat.token,
        displayName: result.seat.displayName,
        sittingOut: rooms.isSittingOut(request.params.code, result.seat.id),
        sittingOutReason: rooms.sittingOutReason(
          request.params.code,
          result.seat.id,
        ),
      };
    },
  );

  /** The table device's manual evict action (ADR-0003) — no automatic trigger. */
  app.post<RoomSeatRoute>(
    "/rooms/:code/seats/:seatId/evict",
    (request, reply) => {
      const seatId = parseSeatId(request.params.seatId);
      if (seatId === undefined) {
        return reply.code(400).send({ error: "invalid-seat-id" });
      }
      const room = findRoomOrReject(rooms, request.params.code, reply);
      if (!room) return;
      const eviction = rooms.evictSeat(request.params.code, seatId);
      if (eviction.dispatch !== undefined) {
        publishDispatch(request.params.code, eviction.dispatch, {
          // A non-current eviction leaves the actor and its existing deadline
          // untouched; a current-seat eviction uses a normal fold command and
          // starts the next actor's clock as usual.
          actionClock:
            eviction.dispatch.command.type === "evict"
              ? "preserve"
              : "reschedule",
        });
      }
      broadcastRoomView(request.params.code);
      closeSeatSockets(request.params.code, seatId);
      return reply.code(204).send();
    },
  );

  /** A player releasing their own seat (ADR-0005) — the token-gated twin of evict. */
  app.post<RoomSeatRoute>(
    "/rooms/:code/seats/:seatId/leave",
    (request, reply) => {
      const seatId = parseSeatId(request.params.seatId);
      if (seatId === undefined) {
        return reply.code(400).send({ error: "invalid-seat-id" });
      }
      const body = LeaveSeatRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid-request-body" });
      }
      const result = rooms.leaveSeat(
        request.params.code,
        seatId,
        body.data.token,
      );
      if ("error" in result) {
        return reply
          .code(result.error === "room-not-found" ? 404 : 403)
          .send({ error: result.error });
      }
      if (result.dispatch !== undefined) {
        publishDispatch(request.params.code, result.dispatch, {
          // Same fold/queue handling as evict: a non-actor leave preserves the
          // current actor's clock, a current-actor leave folds and reschedules.
          actionClock:
            result.dispatch.command.type === "evict"
              ? "preserve"
              : "reschedule",
        });
      }
      broadcastRoomView(request.params.code);
      // Voluntary leave, not an eviction — close the socket without the notice.
      closeSeatSockets(request.params.code, seatId, false);
      return reply.code(204).send();
    },
  );

  app.register((wsApp, _opts, done) => {
    wsApp.get<WsRoute>(
      "/ws",
      {
        websocket: true,
        preValidation: async (request, reply) => {
          const { room: code, role } = request.query;
          if (!code) {
            await reply.code(400).send({ error: "room-required" });
            return;
          }
          const room = rooms.get(code);
          if (!room) {
            await reply.code(404).send({ error: "room-not-found" });
            return;
          }
          if (isUnauthenticatedRole(role)) return;

          if (!authenticateSeat(rooms, code, request.query)) {
            await reply.code(403).send({ error: "invalid-seat-token" });
            return;
          }
        },
      },
      (socket, request) => {
        const code = request.query.room;
        if (code === undefined) return;

        const { role } = request.query;
        let identity: SocketIdentity;
        let movedFrom: SeatId | undefined;
        if (isUnauthenticatedRole(role)) {
          identity = role;
        } else {
          const authenticated = authenticateSeat(rooms, code, request.query);
          if (!authenticated) return;
          identity = authenticated.identity;
          movedFrom = authenticated.movedFrom;
        }
        socketIdentity.set(socket, identity);
        socketRoomCode.set(socket, code);
        pingMissed.set(socket, 0);

        let sockets = roomSockets.get(code);
        if (!sockets) {
          sockets = new Set();
          roomSockets.set(code, sockets);
        }
        sockets.add(socket);

        if (identity === "table") {
          const timer = tableGraceTimers.get(code);
          if (timer) {
            clearTimeout(timer);
            tableGraceTimers.delete(code);
          }
        } else if (isSeat(identity)) {
          // A reconnecting seat resumes silently, no penalty (§7) — clear
          // any presence badge a prior drop had set.
          rooms.setSeatDisconnected(code, identity, false);
        }

        if (movedFrom !== undefined && isSeat(identity)) {
          // A disconnected player may still have the pre-repack seat in
          // localStorage. The token authenticates the player; this stale
          // position is only the source for the resync notice.
          send(socket, { type: "seat-moved", from: movedFrom, to: identity });
        }

        const room = rooms.get(code);
        if (room) {
          broadcastRoomView(code);
          // One fresh snapshot on connect, never event replay (§7, §9).
          if (room.engine !== null) {
            if (identity === "table") {
              send(socket, {
                type: "view-snapshot",
                view: view(room.engine, "table"),
              });
            } else if (
              isSeat(identity) &&
              room.engine.seats.includes(identity)
            ) {
              send(socket, {
                type: "view-snapshot",
                view: view(room.engine, identity),
              });
            }
          }
        }

        socket.on("pong", () => {
          const missed = pingMissed.get(socket) ?? 0;
          pingMissed.set(socket, 0);
          if (missed >= missedPongLimit) {
            markPresence(socket, false);
          }
        });

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

          // Voluntary sit-out/in (ADR-0002) never reaches the engine — it's
          // a seat-only room-store mutation, not a hand command.
          if (
            parseResult.data.type === "sitOut" ||
            parseResult.data.type === "sitIn"
          ) {
            const currentIdentity = socketIdentity.get(socket);
            if (!isSeat(currentIdentity)) {
              sendRejection(socket, "not-permitted");
              return;
            }
            rooms.setSittingOut(
              code,
              currentIdentity,
              parseResult.data.type === "sitOut",
            );
            broadcastRoomView(code);
            return;
          }

          const currentIdentity = socketIdentity.get(socket);
          if (currentIdentity === "lobby") {
            sendRejection(socket, "not-permitted");
            return;
          }
          if (currentIdentity === undefined) {
            sendRejection(socket, "invalid-command");
            return;
          }
          const dispatchResult = rooms.dispatch(
            code,
            currentIdentity,
            parseResult.data.type,
          );
          if ("error" in dispatchResult) {
            sendRejection(socket, dispatchResult.error);
            return;
          }
          if ("reason" in dispatchResult) {
            logDispatch(code, dispatchResult);
            sendRejection(socket, dispatchResult.reason);
            return;
          }

          publishDispatch(code, dispatchResult);
          // A fresh deal-in (new join, reconnect) changes seat state the
          // routine hand-update fan-out above doesn't cover.
          if (
            parseResult.data.type === "startHand" ||
            parseResult.data.type === "nextHand"
          ) {
            broadcastRoomView(code);
          }
        });

        socket.on("close", () => {
          const currentIdentity = socketIdentity.get(socket);
          sockets.delete(socket);
          socketIdentity.delete(socket);
          socketRoomCode.delete(socket);
          pingMissed.delete(socket);

          if (evictedSockets.delete(socket)) return;

          if (currentIdentity === "table") {
            // Room may already be gone (this close came from `endRoom` itself
            // closing every socket) — only arm a fresh grace window for a
            // room that's still live.
            if (rooms.get(code) && !tableGraceTimers.has(code)) {
              tableGraceTimers.set(
                code,
                setTimeout(() => {
                  tableGraceTimers.delete(code);
                  endRoom(code);
                }, graceWindowMs),
              );
            }
          } else if (isSeat(currentIdentity)) {
            rooms.setSeatDisconnected(code, currentIdentity, true);
            broadcastRoomView(code);
          }
        });
      },
    );
    done();
  });

  return app;
}
