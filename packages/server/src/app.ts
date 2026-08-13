import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import {
  AddBotsRequestSchema,
  ChangeSeatCountRequestSchema,
  ChangeShotClockRequestSchema,
  ChangeSoundSettingsRequestSchema,
  ClaimSeatRequestSchema,
  LeaveSeatRequestSchema,
  ClientCommandSchema,
  CreateRoomRequestSchema,
  ReplayRequestSchema,
  summarise,
  view,
  type CommandRejectedMessage,
  type HandEvent,
  type HandSummary,
  isHandComplete,
  type SeatId,
  type SeatCountChangeError,
  type SeatMove,
  type ServerMessage,
} from "@table-top-poker/protocol";
import { handStartContextFor } from "@table-top-poker/recording";
import type {
  Recordings,
  RoomOperation,
  RoomRecording,
} from "@table-top-poker/recording";
import Fastify, {
  type FastifyInstance,
  type FastifyReply,
  type FastifyRequest,
} from "fastify";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { WebSocket } from "ws";
import { ActionClock } from "./action-clock.js";
import {
  chooseBotAction,
  shouldSitIn,
  shouldSitOut,
  unitRandom,
  type BotRng,
} from "./bot-policy.js";
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
  readonly testMode?: boolean;
  readonly botRng?: BotRng;
  readonly botActionDelayMs?: number | readonly [number, number];
  /**
   * Where each Room's durable recording is created. Required, and with no
   * "off" value: recording is a Room invariant (Phase 2 spec #129 §3), so a
   * Room that cannot be recorded is never created. Tests pass a
   * `DirectoryRecordings` over an in-memory filesystem, which records
   * everything a real run would without touching a disk.
   */
  readonly recordings: Recordings;
  /** Overridable for tests only; production reads the wall clock. */
  readonly now?: () => Date;
  /** Overridable for tests only; production runs `ActionClock`'s 90s default. */
  readonly actionClockMs?: number;
  readonly actionClock?: ActionClock;
  readonly pingIntervalMs?: number;
  readonly missedPongLimit?: number;
  readonly graceWindowMs?: number;
}

interface RoomCodeRoute {
  Params: { code: string };
}

interface RoomSeatRoute {
  Params: { code: string; seatId: string };
}

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
type BotActionDelay = number | readonly [number, number];

const DEFAULT_BOT_ACTION_DELAY_MS: readonly [number, number] = [250, 750];

function assertBotActionDelay(delay: BotActionDelay): void {
  if (typeof delay === "number") {
    if (!Number.isFinite(delay) || delay < 0) {
      throw new RangeError(
        `bot action delay must be a finite non-negative number, got ${String(delay)}`,
      );
    }
    return;
  }

  const [minimum, maximum] = delay;
  if (
    !Number.isFinite(minimum) ||
    !Number.isFinite(maximum) ||
    minimum < 0 ||
    maximum < minimum
  ) {
    throw new RangeError(
      `bot action delay range must contain finite non-negative values in ascending order, got [${String(minimum)}, ${String(maximum)}]`,
    );
  }
}

function sampleBotActionDelay(delay: BotActionDelay, rng: BotRng): number {
  if (typeof delay === "number") return delay;
  const [minimum, maximum] = delay;
  if (minimum === maximum) return minimum;
  return minimum + unitRandom(rng) * (maximum - minimum);
}

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

/**
 * Turns an accepted dispatch into the whole operation the recording takes.
 * The state right after `HandStarted` is where a Hand's seats and button are
 * fixed; nothing later in the same operation moves them.
 */
function toHandOperation(
  result: DispatchSuccess,
  now: () => Date,
): RoomOperation {
  const events = result.steps.map((step) => step.event);
  const opening = result.steps.find(
    (step) => step.event.type === "HandStarted",
  );
  const context =
    opening === undefined
      ? undefined
      : handStartContextFor(events, opening.state, now);
  return {
    ...(context === undefined ? {} : { context }),
    command: result.command,
    outcome: events,
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
  options: BuildAppOptions,
): Promise<FastifyInstance> {
  const rooms = options.rooms ?? new RoomStore();
  const testMode = options.testMode ?? false;
  const botRng = options.botRng ?? Math.random;
  const botActionDelay: BotActionDelay =
    options.botActionDelayMs ?? DEFAULT_BOT_ACTION_DELAY_MS;
  assertBotActionDelay(botActionDelay);
  const now = options.now ?? (() => new Date());
  /** One open recording per live room, keyed by join code like every other map here. */
  const roomRecordings = new Map<string, RoomRecording>();
  /**
   * Every completed hand of a room, oldest first, held for the Room's life —
   * no disk read is involved (Phase 2 spec #129 §5). A server restart
   * destroys the Room outright, so there is no session whose listing would
   * need rebuilding.
   */
  const handSummaries = new Map<string, HandSummary[]>();
  /**
   * The hand currently being dealt, accumulating the Events the room has
   * already broadcast, so `summarise` can be handed the whole hand the
   * moment it completes. `startedAt` is stamped here rather than inside
   * `summarise`, which stays free of a clock.
   */
  const handsInProgress = new Map<
    string,
    { readonly startedAt: string; readonly events: HandEvent[] }
  >();
  const pingIntervalMs = options.pingIntervalMs ?? 10_000;
  const missedPongLimit = options.missedPongLimit ?? 2;
  const graceWindowMs = options.graceWindowMs ?? 60_000;
  const roomSockets = new Map<string, Set<WebSocket>>();
  const socketIdentity = new Map<WebSocket, SocketIdentity>();
  const actionClock =
    options.actionClock ?? new ActionClock(options.actionClockMs);
  const socketRoomCode = new Map<WebSocket, string>();
  const pingMissed = new Map<WebSocket, number>();
  const evictedSockets = new WeakSet<WebSocket>();
  const tableGraceTimers = new Map<string, NodeJS.Timeout>();
  const botActionTimers = new Map<string, ReturnType<typeof setTimeout>>();
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
          view: view(room.engine, "table", room.turnEndsAt),
        });
      } else if (isSeat(identity) && room.engine.seats.includes(identity)) {
        send(socket, {
          type: "view-snapshot",
          view: view(room.engine, identity, room.turnEndsAt),
        });
      }
    }
  }

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

  /**
   * Drains and closes a room's recording as the room goes away. What is on
   * disk stays there — closing releases the writer, it does not discard the
   * recording.
   */
  async function drainRecording(code: string): Promise<void> {
    const recording = roomRecordings.get(code);
    if (recording === undefined) return;
    roomRecordings.delete(code);
    try {
      await recording.close();
    } catch (error) {
      app.log.error({ err: error, room: code }, "recording close failed");
    }
  }

  /** Fire-and-forget drain, for the synchronous room-teardown path. */
  function closeRecording(code: string): void {
    void drainRecording(code);
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
   * then discard the room itself. The Room recording on disk is closed, not
   * removed — Phase 1's keep-everything-forever retention is binding.
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
    clearBotActionTimer(code);
    handSummaries.delete(code);
    handsInProgress.delete(code);
    closeRecording(code);
    rooms.end(code);
  }

  /**
   * The hand listing is a table-device surface (Phase 2 spec #129 §6), so
   * summaries go only to table identities — a player's socket never receives
   * one, and never asks for one.
   */
  function sendToTables(code: string, message: ServerMessage): void {
    const sockets = roomSockets.get(code);
    if (!sockets) return;
    for (const socket of sockets) {
      if (socketIdentity.get(socket) === "table") send(socket, message);
    }
  }

  function sendHandList(socket: WebSocket, code: string): void {
    send(socket, {
      type: "hand-list",
      summaries: handSummaries.get(code) ?? [],
    });
  }

  /**
   * Feeds the Events the room just broadcast into the hand being recorded,
   * and summarises that hand the moment it completes — the same moment
   * "Review hands" becomes reachable (§6). Only a hand seen whole, from its
   * `HandStarted` to its `HandComplete`, is ever summarised, so a listing
   * can't be built from a partial recording (§4).
   */
  function accumulateHandSummary(
    code: string,
    steps: readonly DispatchStep[],
  ): void {
    for (const step of steps) {
      if (step.event.type === "HandStarted") {
        handsInProgress.set(code, {
          startedAt: new Date().toISOString(),
          events: [],
        });
      }
      const inProgress = handsInProgress.get(code);
      if (inProgress === undefined) continue;
      inProgress.events.push(step.event);
      if (step.event.type !== "HandComplete") continue;

      handsInProgress.delete(code);
      const summaries = handSummaries.get(code) ?? [];
      const summary = summarise(inProgress.events, {
        // 1-based across the Room's life, matching the recording's
        // `hand-NNNN` partition.
        handOrdinal: summaries.length + 1,
        startedAt: inProgress.startedAt,
      });
      summaries.push(summary);
      handSummaries.set(code, summaries);
      sendToTables(code, { type: "hand-summary", summary });
    }
  }

  /**
   * Hands the room's recording one whole engine operation — the command, the
   * events or rejection it produced, and the Hand context when it opens a
   * Hand. The recording owns ordering, so this is not awaited here; issue
   * #118 moves the await in front of the broadcast.
   */
  function recordDispatch(
    code: string,
    result: DispatchRejection | DispatchSuccess,
  ): void {
    if (result.command === undefined) return;
    const recording = roomRecordings.get(code);
    if (recording === undefined) {
      // Every room created through `POST /rooms` has one. Reaching here means
      // play is happening unrecorded, which the Room invariant forbids — so
      // it is a loud bug, never a quiet skip (Phase 2 spec #129 §3).
      app.log.error({ room: code }, "dispatch in a room with no recording");
      return;
    }

    const operation =
      "steps" in result
        ? toHandOperation(result, now)
        : result.rejection === undefined
          ? undefined
          : { command: result.command, outcome: result.rejection };
    if (operation === undefined) return;

    void recording.append(operation).catch((error: unknown) => {
      // Filesystem detail belongs in operational logs, never on the wire.
      // Telling the table and blocking play is issue #121's recording-paused
      // state; until then a failure is loud here and nowhere else.
      app.log.error({ err: error, room: code }, "recording append failed");
    });
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
        // socket already closing; its 'close' handler cleans up
      }
    }
  }, pingIntervalMs);

  // Draining every open recording is part of closing the app, not of ending
  // each Room: `systemctl restart poker` on a deploy closes the process, not
  // the Rooms, and an append in flight at that moment would otherwise be lost.
  app.addHook("onClose", async () => {
    clearInterval(pingTimer);
    for (const timer of tableGraceTimers.values()) clearTimeout(timer);
    for (const code of botActionTimers.keys()) clearBotActionTimer(code);
    const draining = [...roomRecordings.keys()].map((code) =>
      drainRecording(code),
    );
    await Promise.all(draining);
  });

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
          view: view(step.state, "table", rooms.get(code)?.turnEndsAt),
        });
      } else if (isSeat(identity) && step.state.seats.includes(identity)) {
        send(socket, {
          type: "hand-update",
          event: redactEventFor(step.event, identity),
          view: view(step.state, identity, rooms.get(code)?.turnEndsAt),
        });
      }
    }
  }

  function clearBotActionTimer(code: string): void {
    const timer = botActionTimers.get(code);
    if (timer === undefined) return;
    clearTimeout(timer);
    botActionTimers.delete(code);
  }

  function rollBotSitStates(code: string): boolean {
    if (!testMode) return false;
    const room = rooms.get(code);
    if (!room) return false;

    let changed = false;
    const bots = room.seats.filter((seat) => seat.claimed && seat.bot === true);
    const sittingOutBots = bots.filter((seat) => seat.sittingOut);
    const activeBots = bots.filter((seat) => !seat.sittingOut);

    for (const seat of sittingOutBots) {
      if (seat.disconnected) continue;
      if (shouldSitIn(botRng)) {
        rooms.setSittingOut(code, seat.id, false);
        changed = true;
      }
    }

    const dealInEligible = () =>
      room.seats.filter(
        (seat) => seat.claimed && !seat.disconnected && !seat.sittingOut,
      ).length;
    let eligibleCount = dealInEligible();

    if (eligibleCount < 2) {
      for (const seat of sittingOutBots) {
        if (eligibleCount >= 2) break;
        if (seat.sittingOut && !seat.disconnected) {
          rooms.setSittingOut(code, seat.id, false);
          eligibleCount++;
          changed = true;
        }
      }
    }

    for (const seat of activeBots) {
      if (seat.disconnected || seat.sittingOut || eligibleCount <= 2) continue;
      if (!shouldSitOut(botRng)) continue;
      rooms.setSittingOut(code, seat.id, true);
      eligibleCount--;
      changed = true;
    }
    return changed;
  }

  function scheduleBotAction(code: string): void {
    clearBotActionTimer(code);
    if (!testMode) return;

    const room = rooms.get(code);
    const actor = rooms.currentActor(code);
    if (room === undefined || actor === undefined) return;
    const seat = room.seats[actor];
    if (!seat?.claimed || seat.bot !== true) return;

    const timer = setTimeout(
      () => {
        botActionTimers.delete(code);

        const currentRoom = rooms.get(code);
        if (!currentRoom || rooms.currentActor(code) !== actor) return;
        const currentSeat = currentRoom.seats[actor];
        if (!currentSeat?.claimed || currentSeat.bot !== true) return;
        const engine = currentRoom.engine;
        if (engine?.hand?.status !== "betting") return;

        const actorView = view(engine, actor);
        if (
          actorView.phase !== "betting" ||
          actorView.legalActions.length === 0
        ) {
          return;
        }

        const action = chooseBotAction(actorView.legalActions, botRng);
        const result = rooms.dispatch(code, actor, action);
        if (!("steps" in result)) {
          rescheduleActionClock(code);
          scheduleBotAction(code);
          return;
        }
        publishDispatch(code, result);
      },
      sampleBotActionDelay(botActionDelay, botRng),
    );
    botActionTimers.set(code, timer);
  }

  function rescheduleActionClock(code: string): void {
    const room = rooms.get(code);
    const actor = rooms.currentActor(code);
    if (room === undefined || actor === undefined) {
      actionClock.clear(code);
      if (room !== undefined) room.turnEndsAt = null;
      return;
    }

    const { enabled, seconds } = room.shotClockSettings;
    if (!enabled) {
      actionClock.clear(code);
      room.turnEndsAt = null;
      return;
    }

    const timeoutMs =
      options.actionClock === undefined && options.actionClockMs !== undefined
        ? options.actionClockMs
        : seconds * 1000;
    room.turnEndsAt = now().getTime() + timeoutMs;
    actionClock.schedule(code, timeoutMs, () => {
      const currentRoom = rooms.get(code);
      if (!currentRoom || rooms.currentActor(code) !== actor) {
        rescheduleActionClock(code);
        return;
      }

      const actorView =
        currentRoom.engine === null
          ? undefined
          : view(currentRoom.engine, actor);
      const action =
        actorView?.phase === "betting" &&
        actorView.legalActions.includes("check")
          ? "check"
          : "fold";
      const result = rooms.dispatch(code, actor, action);
      if ("steps" in result) {
        publishDispatch(code, result);
        return;
      }
      rescheduleActionClock(code);
    });
  }

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
    recordDispatch(code, result);
    if (options.actionClock === "preserve") {
      if (rooms.currentActor(code) === undefined) {
        actionClock.clear(code);
        const room = rooms.get(code);
        if (room !== undefined) room.turnEndsAt = null;
      }
    } else {
      rescheduleActionClock(code);
    }
    for (const step of result.steps) {
      fanOutHandUpdate(code, step);
    }
    // After the fan-out: the summary describes a hand the room has already
    // seen, so no table learns of a completed hand before its last Event.
    accumulateHandSummary(code, result.steps);
    if (
      testMode &&
      result.steps.some((step) => step.event.type === "HandComplete")
    ) {
      if (rollBotSitStates(code)) broadcastRoomView(code);
    }
    scheduleBotAction(code);
  }

  await app.register(fastifyStatic, { root: publicDir, index: false });
  await app.register(fastifyWebsocket);

  app.get("/", (_request, reply) => {
    return reply
      .type("text/html")
      .header("cache-control", "no-store")
      .send(readIndexOr(publicTableIndexPath));
  });

  app.get("/config", () => ({ testMode }));

  app.post("/rooms", async (request, reply) => {
    const body = CreateRoomRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        error: seatCountBodyError(body.error.issues),
      });
    }

    // Creating the Room is transactional with creating its recording: the
    // Room is staged, `room.json` is written, and only a confirmed write
    // publishes it. A Room that cannot be recorded is never joinable and
    // never gets a code or a QR (Phase 2 spec #129 §3).
    const staged = rooms.stage(body.data.seatCount);
    let recording: RoomRecording;
    try {
      recording = await options.recordings.create({
        roomId: staged.room.id,
        code: staged.room.code,
        createdAt: now().toISOString(),
      });
    } catch (error) {
      staged.discard();
      app.log.error({ err: error }, "could not create the room recording");
      return reply.code(503).send({ error: "recording-unavailable" });
    }

    const room = staged.commit();
    roomRecordings.set(room.code, recording);
    const url = joinUrl(request.headers.host ?? "localhost", room.code);
    const qrCodeDataUrl = await roomQrCodeDataUrl(url);
    return { code: room.code, joinUrl: url, qrCodeDataUrl };
  });

  if (testMode) {
    app.post<RoomCodeRoute>("/rooms/:code/bots", (request, reply) => {
      const body = AddBotsRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid-request-body" });
      }

      const room = findRoomOrReject(rooms, request.params.code, reply);
      if (!room) return;
      const result = rooms.addBots(room, body.data.count);

      if (result.seats.length > 0) {
        broadcastRoomView(room.code);
      }
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

  app.post<RoomCodeRoute>("/rooms/:code/shot-clock", (request, reply) => {
    const body = ChangeShotClockRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid-request-body" });
    }
    const room = findRoomOrReject(rooms, request.params.code, reply);
    if (!room) return;
    const result = rooms.changeShotClockSettings(room.code, body.data);
    if ("error" in result) {
      return reply
        .code(result.error === "room-not-found" ? 404 : 400)
        .send({ error: result.error });
    }
    broadcastRoomView(room.code);
    return result;
  });

  app.get<RoomCodeRoute>("/join/:code", (request, reply) => {
    const room = findRoomOrReject(rooms, request.params.code, reply);
    if (!room) return;
    const playerOrigin = process.env.PLAYER_CLIENT_ORIGIN;
    if (playerOrigin) {
      return reply.redirect(`${playerOrigin}/join/${room.code}`);
    }
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
          actionClock:
            result.dispatch.command.type === "evict"
              ? "preserve"
              : "reschedule",
        });
      }
      broadcastRoomView(request.params.code);
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
          rooms.setSeatDisconnected(code, identity, false);
        }

        if (movedFrom !== undefined && isSeat(identity)) {
          send(socket, { type: "seat-moved", from: movedFrom, to: identity });
        }

        const room = rooms.get(code);
        if (room) {
          broadcastRoomView(code);
          // Incremental pushes alone would leave a reloaded table with an
          // empty picker for hands it had already seen — Phase 1's catch-up
          // is one view snapshot, which carries no summaries (§5). Sent even
          // when empty, so the picker has a definite starting state.
          if (identity === "table") sendHandList(socket, code);
          // One fresh snapshot on connect, never event replay (§7, §9).
          if (room.engine !== null) {
            if (identity === "table") {
              send(socket, {
                type: "view-snapshot",
                view: view(room.engine, "table", room.turnEndsAt),
              });
            } else if (
              isSeat(identity) &&
              room.engine.seats.includes(identity)
            ) {
              send(socket, {
                type: "view-snapshot",
                view: view(room.engine, identity, room.turnEndsAt),
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
            // A replay request rides this same socket and this same Zod
            // boundary, in its own schema, even though it never reaches
            // `decide` (§5).
            const replay = ReplayRequestSchema.safeParse(parsed);
            if (!replay.success) {
              sendRejection(socket, "invalid-command");
              return;
            }
            if (socketIdentity.get(socket) !== "table") {
              sendRejection(socket, "not-permitted");
              return;
            }
            if (replay.data.type === "list-hands") {
              sendHandList(socket, code);
            }
            // `get-hand` is served by the Replay capability, which lands with
            // the recording read path; the request shape is validated here so
            // that ticket adds a response, not a boundary.
            return;
          }

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
            recordDispatch(code, dispatchResult);
            sendRejection(socket, dispatchResult.reason);
            return;
          }

          publishDispatch(code, dispatchResult);
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
