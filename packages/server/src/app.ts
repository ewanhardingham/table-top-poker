import fastifyStatic from "@fastify/static";
import fastifyWebsocket from "@fastify/websocket";
import {
  AddBotsRequestSchema,
  ChangeSeatCountRequestSchema,
  ChangeShotClockRequestSchema,
  ChangeShowdownClockRequestSchema,
  ChangeSoundSettingsRequestSchema,
  ClaimSeatRequestSchema,
  LeaveSeatRequestSchema,
  ClientCommandSchema,
  CreateRoomRequestSchema,
  ReplayRequestSchema,
  summarise,
  view,
  type ActionType,
  type CommandRejectedMessage,
  type HandEvent,
  type HandSummary,
  isHandComplete,
  type SeatId,
  type SeatCountChangeError,
  type SeatMove,
  type ServerMessage,
} from "@table-top-poker/protocol";
import type { Recordings, RoomRecording } from "@table-top-poker/recording";
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
  chooseShowdownAction,
  shouldSitIn,
  shouldSitOut,
  unitRandom,
  type BotRng,
} from "./bot-policy.js";
import { tableReplayOf } from "./hand-replay.js";
import { joinUrl, roomQrCodeDataUrl } from "./qr.js";
import { redactEventFor } from "./redact-event.js";
import {
  type ClaimSeatError,
  type DispatchRejection,
  type DispatchStep,
  type DispatchTransaction,
  type EvictSeatResult,
  type Room,
  RoomStore,
  type SeatCommandType,
  toRoomView,
} from "./rooms.js";
import { RoomRecordings, type PausedRoom } from "./room-recordings.js";

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
  /** Required, and with no "off" value: recording is a Room invariant. */
  readonly recordings: Recordings;
  /** Overridable for tests only; production reads the wall clock. */
  readonly now?: () => Date;
  /** Overridable for tests only; production runs `ActionClock`'s 90s default. */
  readonly actionClockMs?: number;
  /** Overridable for tests only; production reads the room's showdown clock. */
  readonly showdownClockMs?: number;
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
type ClockPhase = "betting" | "showing";

interface ClockedActor {
  readonly seatId: SeatId;
  readonly phase: ClockPhase;
}

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

const CLAIM_ERROR_STATUS: Record<ClaimSeatError | "recording-paused", number> =
  {
    "room-not-found": 404,
    "seat-not-found": 404,
    "seat-already-claimed": 409,
    "invalid-display-name": 400,
    "duplicate-display-name": 409,
    "recording-paused": 503,
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

const RECORDING_EVENT = {
  paused: "recording-paused",
  resumed: "recording-resumed",
  stopped: "recording-stopped",
} as const;

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
  const roomRecordings = new RoomRecordings({
    suspend(code) {
      cancelActionClock(code);
      clearBotActionTimer(code);
    },
    resume(code, paused) {
      resumePausedTransaction(code, paused);
    },
    announce(code, event) {
      broadcastToRoom(code, { type: RECORDING_EVENT[event] });
    },
    logError(code, message, error) {
      app.log.error({ err: error, room: code }, message);
    },
  });
  /** Every completed hand, oldest first, for the Room's life; no disk read. */
  const handSummaries = new Map<string, HandSummary[]>();
  /** The hand being dealt — see Recording in `docs/design/server.md`. */
  const handsInProgress = new Map<
    string,
    {
      readonly handOrdinal: number;
      readonly startedAt: string;
      readonly events: HandEvent[];
    }
  >();
  /** Hands *started* per room, so an abandoned hand still consumes its ordinal. */
  const handsStarted = new Map<string, number>();
  const pingIntervalMs = options.pingIntervalMs ?? 10_000;
  const missedPongLimit = options.missedPongLimit ?? 2;
  const graceWindowMs = options.graceWindowMs ?? 60_000;
  const roomSockets = new Map<string, Set<WebSocket>>();
  const socketIdentity = new Map<WebSocket, SocketIdentity>();
  const actionClock =
    options.actionClock ?? new ActionClock(options.actionClockMs);
  const socketRoomCode = new Map<WebSocket, string>();
  /** One operation queue per Room — see `docs/design/server.md`. Idle Rooms drop their tail. */
  const roomQueues = new Map<string, Promise<unknown>>();
  const pingMissed = new Map<WebSocket, number>();
  const evictedSockets = new WeakSet<WebSocket>();
  const tableGraceTimers = new Map<string, NodeJS.Timeout>();
  const botActionTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const app = Fastify();

  function enqueue<T>(
    code: string,
    operation: () => Promise<T> | T,
  ): Promise<T> {
    const queued = (roomQueues.get(code) ?? Promise.resolve()).then(
      operation,
      operation,
    );
    const tail = queued.then(
      () => undefined,
      () => undefined,
    );
    roomQueues.set(code, tail);
    void tail.then(() => {
      if (roomQueues.get(code) === tail) roomQueues.delete(code);
    });
    return queued;
  }

  /** Queues work nothing awaits, so its failures land in the log, not unhandled. */
  function enqueueDetached(
    code: string,
    operation: () => Promise<void> | void,
  ): void {
    void enqueue(code, operation).catch((error: unknown) => {
      app.log.error({ err: error, room: code }, "room operation failed");
    });
  }

  function send(socket: WebSocket, message: ServerMessage): void {
    // A queued operation outlives the message that started it, and `ws` treats
    // a send after close as an error.
    if (socket.readyState !== socket.OPEN) return;
    socket.send(JSON.stringify(message));
  }

  function sendRejection(
    socket: WebSocket,
    reason: CommandRejectedMessage["reason"],
  ): void {
    send(socket, { type: "command-rejected", reason });
  }

  function broadcastToRoom(code: string, message: ServerMessage): void {
    const sockets = roomSockets.get(code);
    if (!sockets) return;
    for (const socket of sockets) send(socket, message);
  }

  function broadcastRoomView(code: string): void {
    const room = rooms.get(code);
    if (!room) return;
    broadcastToRoom(code, { type: "room-view", view: toRoomView(room) });
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

  /** Closing releases the writer; what is on disk stays there. */
  /** Cosmetic presence toggle for a seat's socket — never touches `rooms.dispatch`. */
  function markPresence(socket: WebSocket, disconnected: boolean): void {
    const identity = socketIdentity.get(socket);
    const code = socketRoomCode.get(socket);
    if (!isSeat(identity) || code === undefined) return;
    enqueueDetached(code, () => {
      setPresence(code, identity, disconnected);
    });
  }

  /** Presence decides deal-in eligibility, so it takes its turn in the queue. */
  function setPresence(
    code: string,
    seatId: SeatId,
    disconnected: boolean,
  ): void {
    rooms.setSeatDisconnected(code, seatId, disconnected);
    broadcastRoomView(code);
  }

  /** Ends a room from either trigger — see "End session" in `docs/design/server.md`. */
  async function endRoom(code: string): Promise<void> {
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
    handsStarted.delete(code);
    await roomRecordings.forget(code);
    rooms.end(code);
  }

  /** The hand listing is a table-device surface: a player never receives one. */
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

  /** Answers a `get-hand` whole — see Recording in `docs/design/server.md`. */
  function sendHandReplay(
    socket: WebSocket,
    code: string,
    handOrdinal: number,
  ): void {
    const room = rooms.get(code);
    const listed = handSummaries
      .get(code)
      ?.some((summary) => summary.handOrdinal === handOrdinal);
    if (room === undefined || listed !== true) {
      sendRejection(socket, "hand-unavailable");
      return;
    }

    void options.recordings
      .readHand(room.id, handOrdinal)
      .then((read) => tableReplayOf(read))
      .catch((error: unknown) => ({
        status: "unavailable" as const,
        diagnostic: `read failed: ${String(error)}`,
      }))
      .then((replay) => {
        if (replay.status === "unavailable") {
          app.log.error(
            { room: code, hand: handOrdinal, replay: replay.diagnostic },
            "could not replay hand",
          );
          sendRejection(socket, "hand-unavailable");
          return;
        }
        send(socket, {
          type: "hand-replay",
          handOrdinal,
          positions: replay.positions,
        });
      });
  }

  /**
   * The showing window outlives `HandComplete` (ADR-0008), so the picker row is
   * re-derived and re-sent as each Hand is turned over.
   */
  const RESUMMARISES: ReadonlySet<HandEvent["type"]> = new Set([
    "HandComplete",
    "HoleCardsShown",
    "WinnersDeclared",
  ]);

  /** Summarises a hand only once seen whole, and never once recording stopped. */
  function accumulateHandSummary(
    code: string,
    transaction: DispatchTransaction,
  ): void {
    for (const step of transaction.steps) {
      if (step.event.type === "HandStarted") {
        handsInProgress.delete(code);
        const handOrdinal = (handsStarted.get(code) ?? 0) + 1;
        handsStarted.set(code, handOrdinal);
        handsInProgress.set(code, {
          handOrdinal,
          startedAt:
            transaction.operation.context?.startedAt ?? now().toISOString(),
          events: [],
        });
      }
      const inProgress = handsInProgress.get(code);
      if (inProgress === undefined) continue;
      inProgress.events.push(step.event);
      if (!RESUMMARISES.has(step.event.type)) continue;

      if (roomRecordings.hasStopped(code)) continue;
      let summary: HandSummary;
      try {
        summary = summarise(inProgress.events, {
          handOrdinal: inProgress.handOrdinal,
          startedAt: inProgress.startedAt,
        });
      } catch {
        // Only complete, valid hands enter the listing (#129 §4). Unreachable by
        // construction — this ran because the room broadcast `HandComplete`
        // — but `publishDispatch` is also called from the action clock's
        // timer, where a throw would surface as an unhandled rejection long
        // after the events had gone out. Losing one picker row is the
        // cheaper failure.
        continue;
      }
      const summaries = handSummaries.get(code) ?? [];
      const existing = summaries.findIndex(
        (listed) => listed.handOrdinal === summary.handOrdinal,
      );
      if (existing === -1) summaries.push(summary);
      else summaries[existing] = summary;
      handSummaries.set(code, summaries);
      sendToTables(code, { type: "hand-summary", summary });
    }
  }

  /** Waits for the operation to confirm on disk before it may be broadcast. */
  /** Stops the Actor's clock without arming a replacement — a bare cancel. */
  function cancelActionClock(code: string): void {
    actionClock.clear(code);
    const room = rooms.get(code);
    if (room !== undefined) room.turnEndsAt = null;
  }

  /** Answers whether the Rejection was recorded; pauses the Room otherwise. */
  async function recordRejection(
    code: string,
    rejection: DispatchRejection,
  ): Promise<boolean> {
    if (rejection.operation === undefined) return true;
    const recorded = await roomRecordings.append(code, rejection.operation);
    if (!recorded) roomRecordings.pause(code, rejection.operation);
    return recorded;
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
    // A command already queued for a Room — dispatched but not yet appended —
    // must land before that Room's recording closes, or it is dropped rather
    // than lost loudly.
    await Promise.all([...roomQueues.values()]);
    await roomRecordings.drainAll();
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

  /** Whoever the Room is waiting on, and which clock is therefore running. */
  function clockedActor(code: string): ClockedActor | undefined {
    const betting = rooms.currentActor(code);
    if (betting !== undefined) return { seatId: betting, phase: "betting" };
    const showing = rooms.showdownActor(code);
    return showing === undefined
      ? undefined
      : { seatId: showing, phase: "showing" };
  }

  function stillActing(code: string, actor: ClockedActor): boolean {
    const current = clockedActor(code);
    return current?.seatId === actor.seatId && current.phase === actor.phase;
  }

  function isBotSeat(code: string, seatId: SeatId): boolean {
    const seat = rooms.get(code)?.seats[seatId];
    return seat?.claimed === true && seat.bot === true;
  }

  /** A bot in the showing queue would otherwise wedge the room — see ADR-0009. */
  function scheduleBotAction(code: string): void {
    clearBotActionTimer(code);
    if (!testMode) return;

    const actor = clockedActor(code);
    if (actor === undefined || !isBotSeat(code, actor.seatId)) return;

    const timer = setTimeout(
      () => {
        botActionTimers.delete(code);
        enqueueDetached(code, async () => {
          if (roomRecordings.isPaused(code)) return;
          const currentRoom = rooms.get(code);
          if (!currentRoom || !isBotSeat(code, actor.seatId)) return;
          if (!stillActing(code, actor)) return;

          const action = botAction(currentRoom, actor);
          if (action === null) return;

          const result = rooms.dispatch(code, actor.seatId, action);
          if (!("commit" in result)) {
            rescheduleActionClock(code);
            scheduleBotAction(code);
            return;
          }
          await publishDispatch(code, result);
        });
      },
      sampleBotActionDelay(botActionDelay, botRng),
    );
    botActionTimers.set(code, timer);
  }

  function botAction(room: Room, actor: ClockedActor): SeatCommandType | null {
    if (actor.phase === "showing") {
      return chooseShowdownAction(rooms.showdownCompelled(room.code), botRng);
    }
    const legal = bettingActionsFor(room, actor.seatId);
    return legal.length === 0 ? null : chooseBotAction(legal, botRng);
  }

  function bettingActionsFor(
    room: Room,
    seatId: SeatId,
  ): readonly ActionType[] {
    if (room.engine?.hand?.status !== "betting") return [];
    const actorView = view(room.engine, seatId);
    return actorView.phase === "betting" ? actorView.legalActions : [];
  }

  /**
   * One scheduler for both clocks; only the betting one may be turned off.
   * Expiry is an ordinary Command, so the engine keeps no notion of time.
   */
  function rescheduleActionClock(
    code: string,
    policy: ActionClockPolicy = "reschedule",
  ): void {
    const room = rooms.get(code);
    const actor = room === undefined ? undefined : clockedActor(code);
    if (
      room === undefined ||
      actor === undefined ||
      (actor.phase === "betting" && !room.shotClockSettings.enabled)
    ) {
      cancelActionClock(code);
      return;
    }

    const fullInterval = clockIntervalMs(room, actor.phase);
    const preserved = policy === "preserve" ? room.turnEndsAt : null;
    const timeoutMs =
      preserved === null
        ? fullInterval
        : Math.max(preserved - now().getTime(), 0);
    room.turnEndsAt = preserved ?? now().getTime() + fullInterval;
    const scheduledAt = room.revision;
    actionClock.schedule(code, timeoutMs, () => {
      enqueueDetached(code, async () => {
        if (roomRecordings.isPaused(code)) return;
        const currentRoom = rooms.get(code);
        if (currentRoom?.revision !== scheduledAt) return;
        if (!stillActing(code, actor)) {
          rescheduleActionClock(code);
          return;
        }

        const result = rooms.dispatch(
          code,
          actor.seatId,
          expiryAction(currentRoom, actor),
        );
        if ("commit" in result) {
          await publishDispatch(code, result);
          return;
        }
        rescheduleActionClock(code);
      });
    });
  }

  function clockIntervalMs(room: Room, phase: ClockPhase): number {
    const override =
      options.actionClock !== undefined
        ? undefined
        : phase === "betting"
          ? options.actionClockMs
          : options.showdownClockMs;
    const seconds =
      phase === "betting"
        ? room.shotClockSettings.seconds
        : room.showdownClockSettings.seconds;
    return override ?? seconds * 1000;
  }

  /** A compelled head is shown: the one place cards are turned over for a player. */
  function expiryAction(room: Room, actor: ClockedActor): SeatCommandType {
    if (actor.phase === "showing") {
      return rooms.showdownCompelled(room.code) ? "show" : "muck";
    }
    return bettingActionsFor(room, actor.seatId).includes("check")
      ? "check"
      : "fold";
  }

  /** The one place the live path and a resuming Retry both settle through. */
  function settleDispatch(
    code: string,
    transaction: DispatchTransaction,
    policy: ActionClockPolicy,
  ): void {
    transaction.commit();

    if (transaction.seatMoves !== undefined) {
      applySeatMoves(code, transaction.seatMoves);
    }
    rescheduleActionClock(code, policy);
    for (const step of transaction.steps) {
      fanOutHandUpdate(code, step);
    }
    // After the fan-out: the summary describes a hand the room has already
    // seen, so no table learns of a completed hand before its last Event.
    accumulateHandSummary(code, transaction);
    if (
      testMode &&
      transaction.steps.some((step) => step.event.type === "HandComplete")
    ) {
      if (rollBotSitStates(code)) broadcastRoomView(code);
    }
    scheduleBotAction(code);
  }

  /** See the commit seam in `docs/design/server.md`; `onSettled` also runs on Retry. */
  async function publishDispatch(
    code: string,
    transaction: DispatchTransaction,
    options: {
      readonly actionClock?: ActionClockPolicy;
      readonly onSettled?: () => void;
    } = {},
  ): Promise<boolean> {
    if (!(await roomRecordings.append(code, transaction.operation))) {
      // The transaction is retained, not discarded — a paused Room's Retry
      // commits this exact operation once recording is confirmed (#129 §3).
      roomRecordings.pause(code, transaction.operation, {
        transaction,
        ...(options.onSettled === undefined
          ? {}
          : { onSettled: options.onSettled }),
      });
      return false;
    }
    settleDispatch(code, transaction, options.actionClock ?? "reschedule");
    options.onSettled?.();
    return true;
  }

  /** The one place Retry and Continue share for resuming play. */
  function resumePausedTransaction(code: string, paused: PausedRoom): void {
    if (paused.transaction !== undefined) {
      settleDispatch(code, paused.transaction, "reschedule");
      paused.onSettled?.();
    } else {
      rescheduleActionClock(code, "reschedule");
      scheduleBotAction(code);
    }
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
    const { seatCount, ...creationSettings } = body.data;
    const staged = rooms.stage(seatCount, creationSettings);
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
    roomRecordings.open(room.code, recording);
    const url = joinUrl(request.headers.host ?? "localhost", room.code);
    const qrCodeDataUrl = await roomQrCodeDataUrl(url);
    return { code: room.code, joinUrl: url, qrCodeDataUrl };
  });

  if (testMode) {
    app.post<RoomCodeRoute>("/rooms/:code/bots", async (request, reply) => {
      const body = AddBotsRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid-request-body" });
      }

      const room = findRoomOrReject(rooms, request.params.code, reply);
      if (!room) return;
      const result = await enqueue(room.code, () => {
        if (roomRecordings.isPaused(room.code)) {
          return { error: "recording-paused" as const };
        }
        const added = rooms.addBots(room, body.data.count);
        if (added.seats.length > 0) {
          broadcastRoomView(room.code);
        }
        return { joined: added.seats.length };
      });
      if ("error" in result) {
        return reply.code(503).send(result);
      }
      return result;
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

  app.post<RoomCodeRoute>("/rooms/:code/end", async (request, reply) => {
    const room = findRoomOrReject(rooms, request.params.code, reply);
    if (!room) return;
    // Behind the queue, so teardown never lands between an append and the
    // commit it was going to confirm.
    await enqueue(room.code, () => endRoom(room.code));
    return reply.code(204).send();
  });

  const changeSeatCount = async (
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
    const result = await enqueue(room.code, () => {
      // A retained startHand/nextHand transaction snapshots the seats it
      // deals in; a repack behind its back would make its Retry commit
      // against seats that no longer match `room.seats`.
      if (roomRecordings.isPaused(room.code)) {
        return { error: "recording-paused" as const };
      }
      const change = rooms.changeSeatCount(room.code, body.data.seatCount);
      if ("error" in change) return change;

      applySeatMoves(room.code, change.moves);
      broadcastRoomView(room.code);
      if (change.moves.length > 0) broadcastDisplayedHand(room.code);
      return change;
    });
    if ("error" in result) {
      if (result.error === "recording-paused") {
        return reply.code(503).send({ error: result.error });
      }
      if (result.error === "seat-count-below-floor") {
        return reply.code(400).send({
          error: result.error,
          minimum: result.minimum,
        });
      }
      return reply.code(400).send({ error: result.error });
    }
    return result;
  };

  app.post<RoomCodeRoute>("/rooms/:code/seats/count", changeSeatCount);

  app.post<RoomCodeRoute>("/rooms/:code/sound", async (request, reply) => {
    const body = ChangeSoundSettingsRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid-request-body" });
    }
    const room = findRoomOrReject(rooms, request.params.code, reply);
    if (!room) return;
    const result = await enqueue(room.code, () => {
      const settings = rooms.changeSoundSettings(room.code, body.data);
      if (!("error" in settings)) broadcastRoomView(room.code);
      return settings;
    });
    if ("error" in result) {
      return reply.code(404).send({ error: result.error });
    }
    return result;
  });

  app.post<RoomCodeRoute>("/rooms/:code/shot-clock", async (request, reply) => {
    const body = ChangeShotClockRequestSchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({ error: "invalid-request-body" });
    }
    const room = findRoomOrReject(rooms, request.params.code, reply);
    if (!room) return;
    // Queued with everything else: a pending edit is taken up by the next
    // committed deal-in, so it must not slip in beside one mid-append.
    const result = await enqueue(room.code, () => {
      const settings = rooms.changeShotClockSettings(room.code, body.data);
      if (!("error" in settings)) broadcastRoomView(room.code);
      return settings;
    });
    if ("error" in result) {
      return reply
        .code(result.error === "room-not-found" ? 404 : 400)
        .send({ error: result.error });
    }
    return result;
  });

  app.post<RoomCodeRoute>(
    "/rooms/:code/showdown-clock",
    async (request, reply) => {
      const body = ChangeShowdownClockRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid-request-body" });
      }
      const room = findRoomOrReject(rooms, request.params.code, reply);
      if (!room) return;
      const result = await enqueue(room.code, () => {
        const settings = rooms.changeShowdownClockSettings(
          room.code,
          body.data,
        );
        if (!("error" in settings)) broadcastRoomView(room.code);
        return settings;
      });
      if ("error" in result) {
        return reply
          .code(result.error === "room-not-found" ? 404 : 400)
          .send({ error: result.error });
      }
      return result;
    },
  );

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
    async (request, reply) => {
      const seatId = parseSeatId(request.params.seatId);
      if (seatId === undefined) {
        return reply.code(400).send({ error: "invalid-seat-id" });
      }
      const body = ClaimSeatRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid-display-name" });
      }
      const code = request.params.code;
      const result = await enqueue(code, () => {
        if (roomRecordings.isPaused(code)) {
          return { error: "recording-paused" as const };
        }
        const claim = rooms.claimSeat(code, seatId, body.data.displayName);
        if (!("error" in claim)) broadcastRoomView(code);
        return claim;
      });
      if ("error" in result) {
        return reply
          .code(CLAIM_ERROR_STATUS[result.error])
          .send({ error: result.error });
      }
      return {
        seatId: result.seat.id,
        token: result.seat.token,
        displayName: result.seat.displayName,
        sittingOut: rooms.isSittingOut(code, result.seat.id),
        sittingOutReason: rooms.sittingOutReason(code, result.seat.id),
      };
    },
  );

  /** False when the owed fold could not be recorded: the seat keeps its hand. */
  async function publishSeatRelease(
    code: string,
    seatId: SeatId,
    released: EvictSeatResult,
    notify: boolean,
  ): Promise<boolean> {
    const finish = () => {
      broadcastRoomView(code);
      closeSeatSockets(code, seatId, notify);
    };
    if (released.transaction === undefined) {
      finish();
      return true;
    }
    // `onSettled` runs the seat's own release too, so a fold retained by a
    // pause frees the seat and closes its socket the same way whether it
    // commits now or later, via Retry.
    return publishDispatch(code, released.transaction, {
      actionClock:
        released.transaction.command.type === "evict"
          ? "preserve"
          : "reschedule",
      onSettled: finish,
    });
  }

  app.post<RoomSeatRoute>(
    "/rooms/:code/seats/:seatId/evict",
    async (request, reply) => {
      const seatId = parseSeatId(request.params.seatId);
      if (seatId === undefined) {
        return reply.code(400).send({ error: "invalid-seat-id" });
      }
      const room = findRoomOrReject(rooms, request.params.code, reply);
      if (!room) return;
      const released = await enqueue(
        room.code,
        async (): Promise<boolean | "recording-paused"> => {
          if (roomRecordings.isPaused(room.code)) return "recording-paused";
          return publishSeatRelease(
            room.code,
            seatId,
            rooms.evictSeat(room.code, seatId),
            true,
          );
        },
      );
      if (released !== true) {
        return reply.code(503).send({
          error:
            released === "recording-paused"
              ? released
              : "recording-unavailable",
        });
      }
      return reply.code(204).send();
    },
  );

  app.post<RoomSeatRoute>(
    "/rooms/:code/seats/:seatId/leave",
    async (request, reply) => {
      const seatId = parseSeatId(request.params.seatId);
      if (seatId === undefined) {
        return reply.code(400).send({ error: "invalid-seat-id" });
      }
      const body = LeaveSeatRequestSchema.safeParse(request.body);
      if (!body.success) {
        return reply.code(400).send({ error: "invalid-request-body" });
      }
      const code = request.params.code;
      const refusal = await enqueue(code, async () => {
        if (roomRecordings.isPaused(code)) return "recording-paused" as const;
        const result = rooms.leaveSeat(code, seatId, body.data.token);
        if ("error" in result) return result.error;
        return (await publishSeatRelease(code, seatId, result, false))
          ? undefined
          : "recording-unavailable";
      });
      if (
        refusal === "recording-paused" ||
        refusal === "recording-unavailable"
      ) {
        return reply.code(503).send({ error: refusal });
      }
      if (refusal !== undefined) {
        return reply
          .code(refusal === "room-not-found" ? 404 : 403)
          .send({ error: refusal });
      }
      return reply.code(204).send();
    },
  );

  app.post<RoomCodeRoute>(
    "/rooms/:code/recording/retry",
    async (request, reply) => {
      const room = findRoomOrReject(rooms, request.params.code, reply);
      if (!room) return;
      const result = await enqueue(room.code, () =>
        roomRecordings.retry(room.code),
      );
      if (result === "not-paused") {
        return reply.code(409).send({ error: "not-paused" });
      }
      if (result === "still-paused") {
        return reply.code(503).send({ error: "recording-unavailable" });
      }
      return reply.code(204).send();
    },
  );

  app.post<RoomCodeRoute>(
    "/rooms/:code/recording/continue",
    async (request, reply) => {
      const room = findRoomOrReject(rooms, request.params.code, reply);
      if (!room) return;
      const result = await enqueue(room.code, () =>
        roomRecordings.continueWithout(room.code),
      );
      if (result === "not-paused") {
        return reply.code(409).send({ error: "not-paused" });
      }
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
        }

        // The catch-up takes its turn in the Room's queue, so a joiner is
        // never caught up to a state the recording has yet to confirm.
        const joined = identity;
        enqueueDetached(code, () => {
          if (isSeat(joined)) {
            rooms.setSeatDisconnected(code, joined, false);
          }

          if (movedFrom !== undefined && isSeat(joined)) {
            send(socket, { type: "seat-moved", from: movedFrom, to: joined });
          }

          const room = rooms.get(code);
          if (!room) return;
          broadcastRoomView(code);
          // A joiner's own catch-up, not a broadcast: recording-paused and
          // recording-stopped are each told once at the moment they start,
          // and a socket that connects after that moment would otherwise
          // never learn play has stopped, or that it is no longer recorded.
          if (roomRecordings.isPaused(code)) {
            send(socket, { type: "recording-paused" });
          } else if (roomRecordings.hasStopped(code)) {
            send(socket, { type: "recording-stopped" });
          }
          // Incremental pushes alone would leave a reloaded table with an
          // empty picker for hands it had already seen — Phase 1's catch-up
          // is one view snapshot, which carries no summaries (#129 §5). Sent even
          // when empty, so the picker has a definite starting state.
          if (joined === "table") sendHandList(socket, code);
          // One fresh snapshot on connect, never event replay (#129 §7, §9).
          if (room.engine === null) return;
          if (joined === "table") {
            send(socket, {
              type: "view-snapshot",
              view: view(room.engine, "table", room.turnEndsAt),
            });
          } else if (isSeat(joined) && room.engine.seats.includes(joined)) {
            send(socket, {
              type: "view-snapshot",
              view: view(room.engine, joined, room.turnEndsAt),
            });
          }
        });

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
            // `decide` (#129 §5).
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
            } else {
              sendHandReplay(socket, code, replay.data.handOrdinal);
            }
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
            const sittingOut = parseResult.data.type === "sitOut";
            enqueueDetached(code, () => {
              if (roomRecordings.isPaused(code)) {
                sendRejection(socket, "recording-paused");
                return;
              }
              rooms.setSittingOut(code, currentIdentity, sittingOut);
              broadcastRoomView(code);
            });
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
          const commandType = parseResult.data.type;
          enqueueDetached(code, async () => {
            if (roomRecordings.isPaused(code)) {
              sendRejection(socket, "recording-paused");
              return;
            }
            const dispatchResult = rooms.dispatch(
              code,
              currentIdentity,
              commandType,
            );
            if ("error" in dispatchResult) {
              sendRejection(socket, dispatchResult.error);
              return;
            }
            if ("reason" in dispatchResult) {
              const recorded = await recordRejection(code, dispatchResult);
              sendRejection(
                socket,
                recorded ? dispatchResult.reason : "recording-paused",
              );
              return;
            }

            const published = await publishDispatch(code, dispatchResult, {
              onSettled: () => {
                if (commandType === "startHand" || commandType === "nextHand") {
                  broadcastRoomView(code);
                }
              },
            });
            if (!published) {
              sendRejection(socket, "recording-paused");
            }
          });
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
                  enqueueDetached(code, () => endRoom(code));
                }, graceWindowMs),
              );
            }
          } else if (isSeat(currentIdentity)) {
            enqueueDetached(code, () => {
              setPresence(code, currentIdentity, true);
            });
          }
        });
      },
    );
    done();
  });

  return app;
}
