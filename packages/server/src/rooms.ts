import { randomUUID } from "node:crypto";
import {
  apply,
  createInitialState,
  DEFAULT_SEAT_COUNT,
  DEFAULT_SOUND_SETTINGS,
  decide,
  MAX_SEAT_COUNT,
  MAX_DISPLAY_NAME_LENGTH,
  MIN_SEAT_COUNT,
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
  type SittingOutReason,
  type SoundSettings,
} from "@table-top-poker/protocol";
import { generateRoomCode } from "./room-code.js";

/**
 * `Seat` and `Room` are `RoomStore`'s internal mutable aggregate state, not
 * wire DTOs — mutated in place by the store rather than replaced, unlike
 * the `readonly` view/slice types elsewhere that cross a render or wire
 * boundary. `toRoomView` is the seam that turns them into an immutable
 * snapshot for broadcast.
 */
export interface Seat {
  readonly id: SeatId;
  claimed: boolean;
  /** Required for new claims; absent only for rooms created before names existed. */
  displayName?: string;
  /** Present only for a test-mode bot claim. */
  bot?: boolean;
  /** Explicit claim/deal lifecycle state; avoids treating a reused seat id as identity. */
  waitingForNextHand?: boolean;
  token: string | null;
  /**
   * Voluntary opt-out only (ADR-0002) — set solely by the `sitOut`/`sitIn`
   * commands via `setSittingOut`. Excludes the seat from deal-in.
   */
  sittingOut: boolean;
  /**
   * Presence badge (ticket 33 §7): missed pongs or a closed socket flip it
   * on, a reconnect flips it off. Beyond the cosmetic badge, it also gates
   * deal-in (ADR-0002) — `dispatch`'s own fold/check/call/raise legality
   * still never consults it directly.
   */
  disconnected: boolean;
}

export interface Room {
  readonly code: string;
  readonly seats: Seat[];
  /** Null until the room's first `startHand` — see `RoomStore.dispatch`. */
  engine: EngineState | null;
  /** A live-hand shrink waits here until the next deal-in recompute. */
  pendingSeatCount: number | null;
  /** Room-wide tactile-sound settings (#182), set by the table. */
  soundSettings: SoundSettings;
}

export type ClaimSeatError =
  | "room-not-found"
  | "seat-not-found"
  | "seat-already-claimed"
  | "invalid-display-name"
  | "duplicate-display-name";

export type ClaimSeatResult = { seat: Seat } | { error: ClaimSeatError };

/** The engine dispatch, when eviction resolves a seat during a live hand. */
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

/** A step of engine state produced by one dispatched command, event by event. */
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

/**
 * `sitOut`/`sitIn` are seat commands that never reach the engine (ADR-0002)
 * — `dispatch` only ever runs the commands the engine understands.
 */
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

/**
 * Shrinking is a positional repack, not a deletion of the seats above the
 * new limit. Claimed seats are sorted by their old position and copied into
 * the surviving positions, carrying every player-owned field with them.
 */
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

/** Keeps a displayed completed hand aligned with an immediate between-hand repack. */
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

/** Seats eligible for the next deal-in: claimed, connected, not voluntarily sitting out. */
function eligibleSeats(room: Room): SeatId[] {
  return room.seats
    .filter((seat) => seat.claimed && !seat.disconnected && !seat.sittingOut)
    .map((seat) => seat.id);
}

/**
 * Records which claimed seats belong to the newly dealt hand. This explicit
 * marker is deliberately separate from numeric seat membership: an evicted
 * seat can be reclaimed before the old hand is complete, and the new claim
 * must still wait even though its id remains in the old engine ring.
 */
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

/** Resets a seat to its unclaimed default — used by the manual evict action. */
function freeSeat(seat: Seat): void {
  seat.claimed = false;
  delete seat.displayName;
  delete seat.bot;
  delete seat.waitingForNextHand;
  seat.token = null;
  seat.sittingOut = false;
  seat.disconnected = false;
}

/**
 * Derives the public lifecycle reason for a seat omitted from the current
 * deal-in: a voluntary opt-out, or a claim that missed the current deal-in
 * (issue #13). The waiting marker is explicit because a reclaimed seat may
 * reuse an id still present in the old engine ring. Shared by `toRoomView`
 * and single-seat lookups.
 */
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

/**
 * Carries the button forward into a freshly recomputed deal-in list: stays
 * put if the previous button is still eligible, otherwise advances to the
 * next eligible seat in physical (ascending id) order, wrapping around —
 * the button skipping an empty/sitting-out/disconnected seat, same as at a
 * real table.
 */
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

/** In-memory room registry, with the engine wired in behind `dispatch`. */
export class RoomStore {
  readonly #rooms = new Map<string, Room>();
  readonly #random: () => number;
  readonly #generateToken: () => string;
  readonly #generateSeed: () => string;

  constructor(
    random: () => number = Math.random,
    generateToken: () => string = randomUUID,
    generateSeed: () => string = randomUUID,
  ) {
    this.#random = random;
    this.#generateToken = generateToken;
    this.#generateSeed = generateSeed;
  }

  /**
   * Creates a room sized to the creator's chosen seat count (issue #74).
   * The range is a domain rule, not a UI one, so an out-of-range count is
   * a caller bug and throws — the HTTP edge parses the untrusted body with
   * `CreateRoomRequestSchema` and answers 400 before ever reaching here.
   */
  create(seatCount: number = DEFAULT_SEAT_COUNT): Room {
    if (!SeatCountSchema.safeParse(seatCount).success) {
      throw new RangeError(
        `seat count must be an integer in ${String(MIN_SEAT_COUNT)}-${String(MAX_SEAT_COUNT)}, got ${String(seatCount)}`,
      );
    }
    const code = generateRoomCode((c) => this.#rooms.has(c), this.#random);
    const room: Room = {
      code,
      seats: makeSeats(seatCount),
      engine: null,
      pendingSeatCount: null,
      soundSettings: DEFAULT_SOUND_SETTINGS,
    };
    this.#rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.#rooms.get(code);
  }

  findSeatByToken(code: string, token: string): Seat | undefined {
    return this.#rooms
      .get(code)
      ?.seats.find((seat) => seat.claimed && seat.token === token);
  }

  /** The seat currently owed a decision in `code`'s hand, or undefined between/after hands. */
  currentActor(code: string): SeatId | undefined {
    const hand = this.#rooms.get(code)?.engine?.hand;
    if (hand?.status !== "betting") return undefined;
    return hand.toAct[0];
  }

  end(code: string): void {
    this.#rooms.delete(code);
  }

  /**
   * A name is required of every new claim (issue #88) — the seat, not just the
   * HTTP edge, owns that rule. `Seat.displayName` stays optional only because
   * rooms created before names existed still have nameless claimed seats.
   */
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

  /**
   * Claims currently-free seats as test-mode bots through the same claim path
   * as a real player. The caller owns the test-mode gate; this store method
   * only handles the aggregate mutation and returns the seats that joined.
   */
  addBots(
    code: string,
    count: number,
  ): { seats: readonly Seat[] } | { error: "room-not-found" } {
    const room = this.#rooms.get(code);
    if (!room) return { error: "room-not-found" };
    if (!Number.isFinite(count) || count <= 0) return { seats: [] };

    const joined: Seat[] = [];
    const freeSeats = room.seats.filter((seat) => !seat.claimed);
    for (const seat of freeSeats.slice(0, count)) {
      const claim = this.claimSeat(code, seat.id, this.#nextBotName(room));
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
   * Frees any claimed seat — active, sitting-out, or disconnected alike —
   * back into the join picker and invalidates its token. The table
   * device's manual "evict" action (ADR-0003); there is no automatic trigger.
   * Any live seat evicted during a live hand is folded first. If it is not the
   * current actor, the engine removes it from the outstanding queue without
   * disturbing whoever is currently to act.
   */
  evictSeat(code: string, seatId: SeatId): EvictSeatResult {
    const room = this.#rooms.get(code);
    const seat = room?.seats[seatId];
    if (!seat) return {};

    if (this.currentActor(code) === seatId) {
      const result = this.dispatch(code, seatId, "fold");
      // `currentActor` was read as the live actor, and fold is unconditionally
      // legal for that seat. If that invariant ever breaks, leave the seat
      // claimed so the action clock can recover instead of freeing an actor the
      // engine is still waiting on.
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
      // The engine must accept a live in-hand seat eviction. If that invariant
      // ever breaks, leave the claim intact so a later action-clock fold can
      // recover rather than freeing a seat the engine still considers live.
      if (result === undefined) return {};

      freeSeat(seat);
      return { dispatch: result };
    }

    freeSeat(seat);
    return {};
  }

  /**
   * A player releasing their own seat (ADR-0005) — the free-the-seat
   * operation of {@link evictSeat}, gated on the caller presenting the
   * seat's own token rather than on being the table device. Frees only the
   * seat that token owns; a mismatched or stale token is `not-permitted`.
   */
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

  /**
   * Changes the room's physical seat count. Growing is always safe and
   * immediate. A shrink would renumber the live engine ring, so it is queued
   * until the next deal-in recompute; outside a live hand it applies
   * immediately. The claimed-seat floor includes disconnected and sitting-out
   * players because neither state releases a claim.
   */
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

  /**
   * Replaces the room's tactile-sound settings (#182). The whole triple is
   * written atomically; the table owns these and phones simply obey them, so
   * there is nothing to validate beyond the room existing (the HTTP edge has
   * already parsed the booleans).
   */
  changeSoundSettings(
    code: string,
    settings: SoundSettings,
  ): SoundSettings | { error: "room-not-found" } {
    const room = this.#rooms.get(code);
    if (!room) return { error: "room-not-found" };
    room.soundSettings = settings;
    return room.soundSettings;
  }

  /** Whether `seatId` reads as "sitting out" in the room's public view — see `isSittingOut`. */
  isSittingOut(code: string, seatId: SeatId): boolean {
    const room = this.#rooms.get(code);
    return room ? isSittingOut(room, seatId) : false;
  }

  /** The public lifecycle reason for a seat omitted from the next deal-in. */
  sittingOutReason(code: string, seatId: SeatId): SittingOutReason | null {
    const room = this.#rooms.get(code);
    return room ? sittingOutReason(room, seatId) : null;
  }

  /**
   * Voluntary seat-state toggle (ADR-0002), driven by the `sitOut`/`sitIn`
   * commands. Never reaches the engine — a sitting-out seat is simply
   * excluded the next time deal-in is recomputed.
   */
  setSittingOut(code: string, seatId: SeatId, sittingOut: boolean): void {
    const room = this.#rooms.get(code);
    const seat = room?.seats[seatId];
    if (!seat?.claimed) return;
    seat.sittingOut = sittingOut;
  }

  /**
   * Presence-only badge toggle (ticket 33 §7): missed pongs or a socket
   * closing flip it on, a reconnect or fresh pong flips it off. Cosmetic to
   * `dispatch`'s fold/check/call/raise legality, which never consults it —
   * but ADR-0002 has it gate deal-in.
   */
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
   * Runs one command through the engine on behalf of an authenticated
   * socket. `identity` is derived server-side from the WS connection, never
   * from the message payload — see Phase 1 spec #130 §6. `startHand` and
   * `nextHand` are table-only at this layer (the engine itself places no
   * such restriction); everything else is seat-only. Every `startHand`/
   * `nextHand` recomputes deal-in from the seats currently claimed,
   * connected, and not sitting out (ADR-0002), carrying the button forward
   * into whatever that recompute leaves eligible.
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

  /**
   * `seatId` is unused by the engine for `startHand`/`nextHand` (no
   * issuer restriction at that layer, per Phase 1 spec #130 §3) — the
   * table isn't a seat, so there's no meaningful id to supply; `0` is an
   * arbitrary placeholder.
   */
  #buildCommand(identity: SeatId | "table", type: SeatCommandType): Command {
    if (type === "startHand" || type === "nextHand") {
      return { type, seatId: 0, seed: this.#generateSeed() };
    }
    return { type, seatId: identity as SeatId };
  }
}

/** Public seat/room projection — never carries a seat's claim token. */
export function toRoomView(room: Room): RoomView {
  return {
    code: room.code,
    pendingSeatCount: room.pendingSeatCount,
    soundSettings: room.soundSettings,
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
