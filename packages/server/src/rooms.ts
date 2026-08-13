import { randomUUID } from "node:crypto";
import {
  apply,
  createInitialState,
  DEFAULT_SEAT_COUNT,
  DEFAULT_SHOT_CLOCK,
  DEFAULT_SOUND_SETTINGS,
  decide,
  MAX_SEAT_COUNT,
  MAX_DISPLAY_NAME_LENGTH,
  MIN_SEAT_COUNT,
  ShotClockSettingsSchema,
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
  /**
   * The Room's durable opaque identity, naming its Room recording directory
   * on disk. Distinct from `code`, which is a live human-typed handle that is
   * re-rolled on collision and means nothing once the Room ends.
   */
  readonly id: string;
  readonly code: string;
  readonly seats: Seat[];
  engine: EngineState | null;
  pendingSeatCount: number | null;
  turnEndsAt: number | null;
  pendingShotClock: ShotClockSettings | null;
  soundSettings: SoundSettings;
  shotClockSettings: ShotClockSettings;
}

/**
 * A Room that has its durable identity and a reserved join code but is not
 * yet joinable. Room creation is transactional with recording creation: the
 * caller stages, writes `room.json`, and only then commits — so a Room whose
 * recording could not be created never enters the live store and never hands
 * out a code or a QR.
 */
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
  readonly dispatch?: DispatchSuccess;
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

export interface DispatchRejection {
  readonly reason: DispatchRejectionReason;
  readonly command?: Command;
  readonly rejection?: Rejection;
}

export type DispatchResult =
  | DispatchSuccess
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
  readonly moves: readonly SeatMove[];
  readonly mapping: ReadonlyMap<SeatId, SeatId>;
}

function repackSeats(room: Room, seatCount: number): SeatRepack {
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

  room.seats.splice(0, room.seats.length, ...replacement);
  return { moves, mapping };
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
      results: hand.results.map((result) => ({
        ...result,
        seatId: map(result.seatId),
      })),
      winners: hand.winners.map(map),
    },
  };
}

function emptySeatRepack(): SeatRepack {
  return { moves: [], mapping: new Map() };
}

function applyPendingShrink(room: Room): SeatRepack {
  if (room.pendingSeatCount === null) return emptySeatRepack();
  const repack = repackSeats(
    room,
    Math.max(room.pendingSeatCount, claimedSeatFloor(room)),
  );
  room.pendingSeatCount = null;
  return repack;
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

function eligibleSeats(room: Room): SeatId[] {
  return room.seats
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

export class RoomStore {
  readonly #rooms = new Map<string, Room>();
  /** Codes reserved by staged-but-uncommitted rooms, so two never collide. */
  readonly #stagedCodes = new Set<string>();
  readonly #random: () => number;
  readonly #generateToken: () => string;
  readonly #generateSeed: () => string;
  readonly #generateRoomId: () => string;

  constructor(
    random: () => number = Math.random,
    generateToken: () => string = randomUUID,
    generateSeed: () => string = randomUUID,
    generateRoomId: () => string = randomUUID,
  ) {
    this.#random = random;
    this.#generateToken = generateToken;
    this.#generateSeed = generateSeed;
    this.#generateRoomId = generateRoomId;
  }

  /**
   * Stages a room sized to the creator's chosen seat count (issue #74),
   * without publishing it. The range is a domain rule, not a UI one, so an
   * out-of-range count is a caller bug and throws — the HTTP edge parses the
   * untrusted body with `CreateRoomRequestSchema` and answers 400 before ever
   * reaching here.
   */
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
      pendingSeatCount: null,
      turnEndsAt: null,
      pendingShotClock: null,
      soundSettings: DEFAULT_SOUND_SETTINGS,
      shotClockSettings: DEFAULT_SHOT_CLOCK,
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

  /**
   * Stages and immediately publishes a room. The uninterrupted path is only
   * safe where nothing else has to succeed first; the HTTP create route uses
   * {@link stage} so the Room's recording is written before it is joinable.
   */
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

  evictSeat(code: string, seatId: SeatId): EvictSeatResult {
    const room = this.#rooms.get(code);
    const seat = room?.seats[seatId];
    if (!seat) return {};

    if (this.currentActor(code) === seatId) {
      const result = this.dispatch(code, seatId, "fold");
      if (!("steps" in result)) return {};

      freeSeat(seat);
      return { dispatch: result };
    }

    const hand = room.engine?.hand;
    const player =
      hand?.status === "betting" ? hand.players.get(seatId) : undefined;
    if (
      hand?.status === "betting" &&
      hand.ring.includes(seatId) &&
      player !== undefined &&
      !player.folded
    ) {
      const result = this.#dispatchEviction(room, seatId);
      if (result === undefined) return {};

      freeSeat(seat);
      return { dispatch: result };
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

    const repack = repackSeats(room, seatCount);
    if (room.engine !== null && isHandComplete(room.engine)) {
      room.engine = remapCompletedEngineState(room.engine, repack.mapping);
    }
    room.pendingSeatCount = null;
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

    let seatMoves: readonly SeatMove[] = [];
    let candidateEngine = room.engine;
    if (type === "startHand" && room.engine === null) {
      const dealIn = eligibleSeats(room);
      if (dealIn.length < 2) return { reason: "not-enough-players" };
      candidateEngine = createInitialState(dealIn);
    } else if (type === "nextHand" && room.engine !== null) {
      if (eligibleSeats(room).length < 2) {
        return { reason: "not-enough-players" };
      }

      const repack = isHandComplete(room.engine)
        ? applyPendingShrink(room)
        : emptySeatRepack();
      seatMoves = repack.moves;
      const previousButton = remapSeatId(room.engine.button, repack.mapping);
      const dealIn = eligibleSeats(room);
      candidateEngine = {
        ...room.engine,
        seats: dealIn,
        button: resolveButtonFor(previousButton, dealIn),
      };
    }

    if (candidateEngine === null) return { reason: "hand-not-in-progress" };

    const command = this.#buildCommand(identity, type);
    const result = this.#runEngineCommand(room, candidateEngine, command);
    if (!("steps" in result)) return result;

    if (type === "startHand" || type === "nextHand") {
      updateWaitingForNextHand(room, candidateEngine.seats);
      applyPendingShotClock(room);
    }

    return seatMoves.length > 0 ? { ...result, seatMoves } : result;
  }

  #dispatchEviction(room: Room, seatId: SeatId): DispatchSuccess | undefined {
    if (room.engine === null) return undefined;
    const result = this.#runEngineCommand(room, room.engine, {
      type: "evict",
      seatId,
    });
    return "steps" in result ? result : undefined;
  }

  #runEngineCommand(
    room: Room,
    candidateEngine: EngineState,
    command: Command,
  ): DispatchSuccess | DispatchRejection {
    const result = decide(candidateEngine, command);
    if (!Array.isArray(result)) {
      return { reason: result.reason, command, rejection: result };
    }

    const steps: DispatchStep[] = [];
    let state = candidateEngine;
    for (const event of result) {
      state = apply(state, event);
      steps.push({ event, state });
    }
    room.engine = state;
    return { command, steps };
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
