import { randomUUID } from "node:crypto";
import { handStartContextFor } from "@table-top-poker/recording";
import type { RoomOperation } from "@table-top-poker/recording";
import {
  apply,
  canStillAct,
  createInitialState,
  DEFAULT_SEAT_COUNT,
  DEFAULT_SHOT_CLOCK,
  DEFAULT_SHOWDOWN_CLOCK,
  DEFAULT_SOUND_SETTINGS,
  decide,
  MAX_SEAT_COUNT,
  MAX_DISPLAY_NAME_LENGTH,
  MIN_SEAT_COUNT,
  ShotClockSettingsSchema,
  ShowdownClockSettingsSchema,
  SeatCountSchema,
  type ClientCommandType,
  type Command,
  type EngineState,
  type HandEvent,
  isHandComplete,
  isHandLive,
  type Rejection,
  type RejectionReason,
  type RoomView,
  type SeatId,
  type SeatCountChange,
  type SeatCountChangeError,
  type SeatMove,
  type ShotClockSettings,
  type ShowdownClockSettings,
  type SittingOutReason,
  type SoundSettings,
} from "@table-top-poker/protocol";
import { generateRoomCode } from "./room-code.js";

export interface Seat {
  readonly id: SeatId;
  claimed: boolean;
  displayName?: string;
  bot?: boolean;
  waitingForNextHand?: boolean;
  token: string | null;
  sittingOut: boolean;
  disconnected: boolean;
}

export interface Room {
  /** See Room ID in `CONTEXT.md`. */
  readonly id: string;
  readonly code: string;
  readonly seats: Seat[];
  engine: EngineState | null;
  /** Committed engine operations, counted so a caller can ask what has happened since. */
  revision: number;
  pendingSeatCount: number | null;
  turnEndsAt: number | null;
  pendingShotClock: ShotClockSettings | null;
  soundSettings: SoundSettings;
  shotClockSettings: ShotClockSettings;
  showdownClockSettings: ShowdownClockSettings;
}

/** Staged, not yet joinable: Room creation is transactional with recording creation. */
export interface StagedRoom {
  readonly room: Room;
  /** Publishes the Room into the live store and returns it. */
  commit(): Room;
  /** Abandons the Room and releases its reserved code. */
  discard(): void;
}

export type ClaimSeatError =
  | "room-not-found"
  | "seat-not-found"
  | "seat-already-claimed"
  | "invalid-display-name"
  | "duplicate-display-name";

export type ClaimSeatResult = { seat: Seat } | { error: ClaimSeatError };

export interface EvictSeatResult {
  /** Present when freeing the seat needs an engine operation recorded first. */
  readonly transaction?: DispatchTransaction;
}

export type ChangeSeatCountError = Exclude<
  SeatCountChangeError,
  "invalid-request-body"
>;

export type ChangeSeatCountResult =
  | SeatCountChange
  | { readonly error: ChangeSeatCountError; readonly minimum?: number };

export interface DispatchStep {
  readonly event: HandEvent;
  readonly state: EngineState;
}

export type DispatchRejectionReason = RejectionReason | "not-enough-players";

export interface DispatchSuccess {
  readonly command: Command;
  readonly steps: readonly DispatchStep[];
  readonly seatMoves?: readonly SeatMove[];
}

/**
 * An accepted dispatch that has changed nothing yet. The caller records
 * {@link operation}, then settles the handle exactly once — see the commit
 * seam in `docs/design/server.md`.
 */
export interface DispatchTransaction extends DispatchSuccess {
  readonly operation: RoomOperation;
  commit(): void;
  discard(): void;
}

export interface DispatchRejection {
  readonly reason: DispatchRejectionReason;
  readonly command?: Command;
  readonly rejection?: Rejection;
  /** Absent for a refusal the engine never saw, which is not recordable. */
  readonly operation?: RoomOperation;
}

export type DispatchResult =
  | DispatchTransaction
  | { readonly error: "room-not-found" | "not-permitted" }
  | DispatchRejection;

export type SeatCommandType = Exclude<ClientCommandType, "sitOut" | "sitIn">;

const TABLE_ONLY_COMMANDS: ReadonlySet<SeatCommandType> = new Set([
  "startHand",
  "nextHand",
]);

function makeSeats(seatCount: number): Seat[] {
  return Array.from({ length: seatCount }, (_, id) => ({
    id,
    claimed: false,
    token: null,
    sittingOut: false,
    disconnected: false,
  }));
}

interface SeatRepack {
  readonly seats: readonly Seat[];
  readonly moves: readonly SeatMove[];
  readonly mapping: ReadonlyMap<SeatId, SeatId>;
}

function planRepack(room: Room, seatCount: number): SeatRepack {
  const claimed = room.seats.filter((seat) => seat.claimed);
  const replacement = makeSeats(seatCount);
  const mapping = new Map<SeatId, SeatId>();
  const moves: SeatMove[] = [];

  claimed.forEach((seat, index) => {
    const target = replacement[index];
    if (target === undefined) {
      throw new Error("seat repack has fewer seats than claimed players");
    }
    mapping.set(seat.id, target.id);
    if (seat.id !== target.id) {
      moves.push({ from: seat.id, to: target.id });
    }
    replacement[index] = {
      ...target,
      claimed: true,
      ...(seat.displayName === undefined
        ? {}
        : { displayName: seat.displayName }),
      ...(seat.bot === true ? { bot: true } : {}),
      ...(seat.waitingForNextHand === true ? { waitingForNextHand: true } : {}),
      token: seat.token,
      sittingOut: seat.sittingOut,
      disconnected: seat.disconnected,
    };
  });

  return { seats: replacement, moves, mapping };
}

function applyRepack(room: Room, repack: SeatRepack): void {
  room.seats.splice(0, room.seats.length, ...repack.seats);
  room.pendingSeatCount = null;
}

function remapSeatId(
  seatId: SeatId,
  mapping: ReadonlyMap<SeatId, SeatId>,
): SeatId {
  return mapping.get(seatId) ?? seatId;
}

function remapCompletedEngineState(
  state: EngineState,
  mapping: ReadonlyMap<SeatId, SeatId>,
): EngineState {
  const hand = state.hand;
  if (hand?.status !== "complete") return state;
  const map = (seatId: SeatId) => remapSeatId(seatId, mapping);

  if (hand.reason === "folded-out") {
    return {
      ...state,
      seats: state.seats.map(map),
      button: map(state.button),
      hand: {
        ...hand,
        button: map(hand.button),
        winner: map(hand.winner),
      },
    };
  }

  return {
    ...state,
    seats: state.seats.map(map),
    button: map(state.button),
    hand: {
      ...hand,
      button: map(hand.button),
      contestants: hand.contestants.map((contestant) => ({
        ...contestant,
        seatId: map(contestant.seatId),
      })),
      lastAggressor:
        hand.lastAggressor === null ? null : map(hand.lastAggressor),
      results: hand.results.map((result) => ({
        ...result,
        seatId: map(result.seatId),
      })),
      queue: hand.queue.map(map),
      mucked: hand.mucked.map(map),
      winners: hand.winners === null ? null : hand.winners.map(map),
    },
  };
}

const NO_SEAT_MAPPING: ReadonlyMap<SeatId, SeatId> = new Map();

function planPendingShrink(room: Room): SeatRepack | undefined {
  if (room.pendingSeatCount === null) return undefined;
  return planRepack(
    room,
    Math.max(room.pendingSeatCount, claimedSeatFloor(room)),
  );
}

function applyPendingShotClock(room: Room): void {
  if (room.pendingShotClock === null) return;
  room.shotClockSettings = room.pendingShotClock;
  room.pendingShotClock = null;
}

function appliedSeatCountChange(
  room: Room,
  moves: readonly SeatMove[] = [],
): SeatCountChange {
  return {
    seatCount: room.seats.length,
    pendingSeatCount: null,
    applied: true,
    moves,
  };
}

function eligibleSeats(seats: readonly Seat[]): SeatId[] {
  return seats
    .filter((seat) => seat.claimed && !seat.disconnected && !seat.sittingOut)
    .map((seat) => seat.id);
}

function updateWaitingForNextHand(room: Room, dealIn: readonly SeatId[]): void {
  const dealt = new Set(dealIn);
  for (const seat of room.seats) {
    if (!seat.claimed || dealt.has(seat.id)) {
      delete seat.waitingForNextHand;
    } else {
      seat.waitingForNextHand = true;
    }
  }
}

function claimedSeatFloor(room: Room): number {
  return Math.max(
    MIN_SEAT_COUNT,
    room.seats.filter((seat) => seat.claimed).length,
  );
}

function freeSeat(seat: Seat): void {
  seat.claimed = false;
  delete seat.displayName;
  delete seat.bot;
  delete seat.waitingForNextHand;
  seat.token = null;
  seat.sittingOut = false;
  seat.disconnected = false;
}

function sittingOutReason(room: Room, seatId: SeatId): SittingOutReason | null {
  const seat = room.seats[seatId];
  if (!seat) return null;
  if (seat.sittingOut) return "voluntary";

  if (seat.claimed && !seat.disconnected && seat.waitingForNextHand === true) {
    return "waiting-for-next-hand";
  }
  return null;
}

function isSittingOut(room: Room, seatId: SeatId): boolean {
  return sittingOutReason(room, seatId) !== null;
}

function resolveButtonFor(
  previousButton: SeatId,
  dealIn: readonly SeatId[],
): SeatId {
  if (dealIn.includes(previousButton)) return previousButton;
  const ordered = [...dealIn].sort((a, b) => a - b);
  const first = ordered[0];
  if (first === undefined) {
    throw new Error("resolveButtonFor requires a non-empty deal-in list");
  }
  return ordered.find((id) => id > previousButton) ?? first;
}

/** The state right after `HandStarted` is where a Hand's seats and button are fixed. */
function toRoomOperation(
  success: DispatchSuccess,
  now: () => Date,
): RoomOperation {
  const events = success.steps.map((step) => step.event);
  const opening = success.steps.find(
    (step) => step.event.type === "HandStarted",
  );
  const context =
    opening === undefined
      ? undefined
      : handStartContextFor(events, opening.state, now);
  return {
    ...(context === undefined ? {} : { context }),
    command: success.command,
    outcome: events,
  };
}

/** Everything a committed dispatch changes about its Room, and nothing else. */
interface StagedTransition {
  readonly engine: EngineState;
  readonly repack?: SeatRepack;
  /** The seats it deals in, when it opens a Hand. */
  readonly dealIn?: readonly SeatId[];
  readonly freedSeat?: SeatId;
}

export class RoomStore {
  readonly #rooms = new Map<string, Room>();
  /** Codes reserved by staged-but-uncommitted rooms, so two never collide. */
  readonly #stagedCodes = new Set<string>();
  readonly #random: () => number;
  readonly #generateToken: () => string;
  readonly #generateSeed: () => string;
  readonly #generateRoomId: () => string;
  readonly #now: () => Date;

  constructor(
    random: () => number = Math.random,
    generateToken: () => string = randomUUID,
    generateSeed: () => string = randomUUID,
    generateRoomId: () => string = randomUUID,
    now: () => Date = () => new Date(),
  ) {
    this.#random = random;
    this.#generateToken = generateToken;
    this.#generateSeed = generateSeed;
    this.#generateRoomId = generateRoomId;
    this.#now = now;
  }

  /** An out-of-range count is a caller bug and throws; the HTTP edge answers 400 first. */
  stage(seatCount: number = DEFAULT_SEAT_COUNT): StagedRoom {
    if (!SeatCountSchema.safeParse(seatCount).success) {
      throw new RangeError(
        `seat count must be an integer in ${String(MIN_SEAT_COUNT)}-${String(MAX_SEAT_COUNT)}, got ${String(seatCount)}`,
      );
    }
    const code = generateRoomCode(
      (c) => this.#rooms.has(c) || this.#stagedCodes.has(c),
      this.#random,
    );
    this.#stagedCodes.add(code);
    const room: Room = {
      id: this.#generateRoomId(),
      code,
      seats: makeSeats(seatCount),
      engine: null,
      revision: 0,
      pendingSeatCount: null,
      turnEndsAt: null,
      pendingShotClock: null,
      soundSettings: DEFAULT_SOUND_SETTINGS,
      shotClockSettings: DEFAULT_SHOT_CLOCK,
      showdownClockSettings: DEFAULT_SHOWDOWN_CLOCK,
    };
    return {
      room,
      commit: () => {
        this.#stagedCodes.delete(code);
        this.#rooms.set(code, room);
        return room;
      },
      discard: () => {
        this.#stagedCodes.delete(code);
      },
    };
  }

  /** Only safe where nothing else has to succeed first; the HTTP route uses {@link stage}. */
  create(seatCount: number = DEFAULT_SEAT_COUNT): Room {
    return this.stage(seatCount).commit();
  }

  get(code: string): Room | undefined {
    return this.#rooms.get(code);
  }

  findSeatByToken(code: string, token: string): Seat | undefined {
    return this.#rooms
      .get(code)
      ?.seats.find((seat) => seat.claimed && seat.token === token);
  }

  currentActor(code: string): SeatId | undefined {
    const hand = this.#rooms.get(code)?.engine?.hand;
    if (hand?.status !== "betting") return undefined;
    return hand.toAct[0];
  }

  /** The head of the showing queue, while the window is open — see ADR-0009. */
  showdownActor(code: string): SeatId | undefined {
    const hand = this.#rooms.get(code)?.engine?.hand;
    if (hand?.status !== "complete" || hand.reason !== "showdown") {
      return undefined;
    }
    if (hand.winners !== null) return undefined;
    return hand.queue[0];
  }

  /** Whether the head of the showing queue is barred from mucking. */
  showdownCompelled(code: string): boolean {
    const hand = this.#rooms.get(code)?.engine?.hand;
    if (hand?.status !== "complete" || hand.reason !== "showdown") return false;
    return hand.results.length === 0;
  }

  end(code: string): void {
    this.#rooms.delete(code);
  }

  claimSeat(
    code: string,
    seatId: SeatId,
    displayName: string,
  ): ClaimSeatResult {
    const room = this.#rooms.get(code);
    if (!room) return { error: "room-not-found" };

    const seat = room.seats[seatId];
    if (!seat) return { error: "seat-not-found" };
    if (seat.claimed) return { error: "seat-already-claimed" };
    const trimmedName = displayName.trim();
    if (trimmedName === "" || trimmedName.length > MAX_DISPLAY_NAME_LENGTH) {
      return { error: "invalid-display-name" };
    }
    const nameKey = trimmedName.toLowerCase();
    if (
      room.seats.some(
        (candidate) =>
          candidate.claimed && candidate.displayName?.toLowerCase() === nameKey,
      )
    ) {
      return { error: "duplicate-display-name" };
    }

    seat.claimed = true;
    seat.displayName = trimmedName;
    delete seat.bot;
    if (room.engine === null) {
      delete seat.waitingForNextHand;
    } else {
      seat.waitingForNextHand = true;
    }
    seat.token = this.#generateToken();
    seat.sittingOut = false;
    seat.disconnected = false;
    return { seat };
  }

  addBots(room: Room, count: number): { seats: readonly Seat[] } {
    if (!Number.isFinite(count) || count <= 0) return { seats: [] };

    const joined: Seat[] = [];
    const freeSeats = room.seats.filter((seat) => !seat.claimed);
    for (const seat of freeSeats.slice(0, count)) {
      const claim = this.claimSeat(room.code, seat.id, this.#nextBotName(room));
      if ("error" in claim) continue;
      claim.seat.bot = true;
      joined.push(claim.seat);
    }
    return { seats: joined };
  }

  #nextBotName(room: Room): string {
    const claimedNames = new Set(
      room.seats
        .filter((seat) => seat.claimed)
        .flatMap((seat) =>
          seat.displayName === undefined
            ? []
            : [seat.displayName.toLowerCase()],
        ),
    );
    let number = 1;
    while (claimedNames.has(`bot ${String(number)}`)) number++;
    return `Bot ${String(number)}`;
  }

  /**
   * Frees a seat, folding the hand it is holding first. Where a fold is
   * needed the returned transaction is what frees the seat — see the commit
   * seam in `docs/design/server.md`.
   */
  evictSeat(code: string, seatId: SeatId): EvictSeatResult {
    const room = this.#rooms.get(code);
    const seat = room?.seats[seatId];
    if (!seat) return {};

    if (this.currentActor(code) === seatId) {
      const transaction = this.#stageSeatRelease(room, seatId, "fold");
      return transaction === undefined ? {} : { transaction };
    }

    const hand = room.engine?.hand;
    const player =
      hand?.status === "betting" ? hand.players.get(seatId) : undefined;
    if (
      hand?.status === "betting" &&
      hand.ring.includes(seatId) &&
      player !== undefined &&
      canStillAct(player)
    ) {
      const transaction = this.#stageSeatRelease(room, seatId, "evict");
      return transaction === undefined ? {} : { transaction };
    }

    freeSeat(seat);
    return {};
  }

  leaveSeat(
    code: string,
    seatId: SeatId,
    token: string,
  ): EvictSeatResult | { readonly error: "room-not-found" | "not-permitted" } {
    const room = this.#rooms.get(code);
    if (!room) return { error: "room-not-found" };
    const seat = room.seats[seatId];
    if (!seat?.claimed || seat.token !== token)
      return { error: "not-permitted" };
    return this.evictSeat(code, seatId);
  }

  changeSeatCount(code: string, seatCount: number): ChangeSeatCountResult {
    const room = this.#rooms.get(code);
    if (!room) return { error: "room-not-found" };
    if (!SeatCountSchema.safeParse(seatCount).success) {
      return { error: "invalid-seat-count" };
    }

    const minimum = claimedSeatFloor(room);
    if (seatCount < minimum) {
      return { error: "seat-count-below-floor", minimum };
    }

    if (seatCount > room.seats.length) {
      room.seats.push(...makeSeats(seatCount).slice(room.seats.length));
      room.pendingSeatCount = null;
      return appliedSeatCountChange(room);
    }

    if (seatCount === room.seats.length) {
      room.pendingSeatCount = null;
      return appliedSeatCountChange(room);
    }

    if (isHandLive(room.engine)) {
      room.pendingSeatCount = seatCount;
      return {
        seatCount: room.seats.length,
        pendingSeatCount: seatCount,
        applied: false,
        moves: [],
      };
    }

    const repack = planRepack(room, seatCount);
    applyRepack(room, repack);
    if (room.engine !== null && isHandComplete(room.engine)) {
      room.engine = remapCompletedEngineState(room.engine, repack.mapping);
    }
    return appliedSeatCountChange(room, repack.moves);
  }

  changeSoundSettings(
    code: string,
    settings: SoundSettings,
  ): SoundSettings | { error: "room-not-found" } {
    const room = this.#rooms.get(code);
    if (!room) return { error: "room-not-found" };
    room.soundSettings = settings;
    return room.soundSettings;
  }

  changeShotClockSettings(
    code: string,
    settings: ShotClockSettings,
  ): ShotClockSettings | { error: "room-not-found" | "invalid-shot-clock" } {
    const room = this.#rooms.get(code);
    if (!room) return { error: "room-not-found" };
    const parsed = ShotClockSettingsSchema.safeParse(settings);
    if (!parsed.success) {
      return { error: "invalid-shot-clock" };
    }
    room.pendingShotClock = parsed.data;
    return parsed.data;
  }

  changeShowdownClockSettings(
    code: string,
    settings: ShowdownClockSettings,
  ):
    | ShowdownClockSettings
    | { error: "room-not-found" | "invalid-showdown-clock" } {
    const room = this.#rooms.get(code);
    if (!room) return { error: "room-not-found" };
    const parsed = ShowdownClockSettingsSchema.safeParse(settings);
    if (!parsed.success) return { error: "invalid-showdown-clock" };
    room.showdownClockSettings = parsed.data;
    return parsed.data;
  }

  isSittingOut(code: string, seatId: SeatId): boolean {
    const room = this.#rooms.get(code);
    return room ? isSittingOut(room, seatId) : false;
  }

  sittingOutReason(code: string, seatId: SeatId): SittingOutReason | null {
    const room = this.#rooms.get(code);
    return room ? sittingOutReason(room, seatId) : null;
  }

  setSittingOut(code: string, seatId: SeatId, sittingOut: boolean): void {
    const room = this.#rooms.get(code);
    const seat = room?.seats[seatId];
    if (!seat?.claimed) return;
    seat.sittingOut = sittingOut;
  }

  setSeatDisconnected(
    code: string,
    seatId: SeatId,
    disconnected: boolean,
  ): void {
    const room = this.#rooms.get(code);
    const seat = room?.seats[seatId];
    if (!seat?.claimed) return;
    seat.disconnected = disconnected;
  }

  /**
   * Decides one Command against the Room and stages what it would change,
   * without changing anything — see the commit seam in
   * `docs/design/server.md`.
   */
  dispatch(
    code: string,
    identity: SeatId | "table",
    type: SeatCommandType,
  ): DispatchResult {
    const room = this.#rooms.get(code);
    if (!room) return { error: "room-not-found" };

    const isTableCommand = TABLE_ONLY_COMMANDS.has(type);
    if (identity === "table" ? !isTableCommand : isTableCommand) {
      return { error: "not-permitted" };
    }

    let repack: SeatRepack | undefined;
    let candidateEngine = room.engine;
    let opensHand = false;
    if (type === "startHand" && room.engine === null) {
      const dealIn = eligibleSeats(room.seats);
      if (dealIn.length < 2) return { reason: "not-enough-players" };
      candidateEngine = createInitialState(dealIn);
      opensHand = true;
    } else if (type === "nextHand" && room.engine !== null) {
      if (eligibleSeats(room.seats).length < 2) {
        return { reason: "not-enough-players" };
      }

      repack = isHandComplete(room.engine)
        ? planPendingShrink(room)
        : undefined;
      const previousButton = remapSeatId(
        room.engine.button,
        repack?.mapping ?? NO_SEAT_MAPPING,
      );
      const dealIn = eligibleSeats(repack?.seats ?? room.seats);
      candidateEngine = {
        ...room.engine,
        seats: dealIn,
        button: resolveButtonFor(previousButton, dealIn),
      };
      opensHand = true;
    }

    if (candidateEngine === null) return { reason: "hand-not-in-progress" };

    const command = this.#buildCommand(identity, type);
    const decided = this.#decide(candidateEngine, command);
    if (!("steps" in decided)) return decided;

    const seatMoves = repack?.moves ?? [];
    return this.#stage(
      room,
      {
        engine: decided.engine,
        ...(repack === undefined ? {} : { repack }),
        ...(opensHand ? { dealIn: candidateEngine.seats } : {}),
      },
      {
        command,
        steps: decided.steps,
        ...(seatMoves.length > 0 ? { seatMoves } : {}),
      },
    );
  }

  /** The fold or eviction that has to be recorded before a seat is freed. */
  #stageSeatRelease(
    room: Room,
    seatId: SeatId,
    type: "fold" | "evict",
  ): DispatchTransaction | undefined {
    if (room.engine === null) return undefined;
    const command: Command = { type, seatId };
    const decided = this.#decide(room.engine, command);
    if (!("steps" in decided)) return undefined;
    return this.#stage(
      room,
      { engine: decided.engine, freedSeat: seatId },
      { command, steps: decided.steps },
    );
  }

  #decide(
    candidateEngine: EngineState,
    command: Command,
  ):
    | { readonly steps: readonly DispatchStep[]; readonly engine: EngineState }
    | DispatchRejection {
    const result = decide(candidateEngine, command);
    if (!Array.isArray(result)) {
      return {
        reason: result.reason,
        command,
        rejection: result,
        operation: { command, outcome: result },
      };
    }

    const steps: DispatchStep[] = [];
    let state = candidateEngine;
    for (const event of result) {
      state = apply(state, event);
      steps.push({ event, state });
    }
    return { steps, engine: state };
  }

  #stage(
    room: Room,
    transition: StagedTransition,
    success: DispatchSuccess,
  ): DispatchTransaction {
    let settled = false;
    const settle = () => {
      if (settled) throw new Error("dispatch transaction already settled");
      settled = true;
    };

    return {
      ...success,
      operation: toRoomOperation(success, this.#now),
      commit: () => {
        settle();
        if (transition.repack !== undefined) {
          applyRepack(room, transition.repack);
        }
        if (transition.dealIn !== undefined) {
          updateWaitingForNextHand(room, transition.dealIn);
          applyPendingShotClock(room);
        }
        if (transition.freedSeat !== undefined) {
          const seat = room.seats[transition.freedSeat];
          if (seat) freeSeat(seat);
        }
        room.engine = transition.engine;
        room.revision += 1;
      },
      discard: () => {
        settle();
      },
    };
  }

  #buildCommand(identity: SeatId | "table", type: SeatCommandType): Command {
    if (type === "startHand" || type === "nextHand") {
      return { type, seatId: 0, seed: this.#generateSeed() };
    }
    return { type, seatId: identity as SeatId };
  }
}

export function toRoomView(room: Room): RoomView {
  return {
    code: room.code,
    pendingSeatCount: room.pendingSeatCount,
    pendingShotClock: room.pendingShotClock,
    soundSettings: room.soundSettings,
    shotClockSettings: room.shotClockSettings,
    showdownClockSettings: room.showdownClockSettings,
    seats: room.seats.map((seat) => {
      const reason = sittingOutReason(room, seat.id);
      return {
        id: seat.id,
        claimed: seat.claimed,
        ...(seat.displayName === undefined
          ? {}
          : { displayName: seat.displayName }),
        ...(seat.bot === true ? { bot: true } : {}),
        sittingOut: reason !== null,
        sittingOutReason: reason,
        disconnected: seat.disconnected,
      };
    }),
  };
}
