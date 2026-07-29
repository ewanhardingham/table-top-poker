import { randomUUID } from "node:crypto";
import {
  apply,
  createInitialState,
  decide,
  type ClientCommandType,
  type Command,
  type EngineState,
  type HandEvent,
  type RejectionReason,
  type RoomView,
  type SeatId,
} from "@table-top-poker/protocol";
import { generateRoomCode } from "./room-code.js";

export const SEAT_COUNT = 8;

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
}

export type ClaimSeatError =
  "room-not-found" | "seat-not-found" | "seat-already-claimed";

export type ClaimSeatResult = { seat: Seat } | { error: ClaimSeatError };

/** A step of engine state produced by one dispatched command, event by event. */
export interface DispatchStep {
  readonly event: HandEvent;
  readonly state: EngineState;
}

export type DispatchRejectionReason = RejectionReason | "not-enough-players";

export type DispatchResult =
  | { readonly steps: readonly DispatchStep[] }
  | { readonly error: "room-not-found" | "not-permitted" }
  | { readonly reason: DispatchRejectionReason };

/**
 * `sitOut`/`sitIn` are seat commands that never reach the engine (ADR-0002)
 * — `dispatch` only ever runs the commands the engine understands.
 */
export type SeatCommandType = Exclude<ClientCommandType, "sitOut" | "sitIn">;

const TABLE_ONLY_COMMANDS: ReadonlySet<SeatCommandType> = new Set([
  "startHand",
  "nextHand",
]);

function makeSeats(): Seat[] {
  return Array.from({ length: SEAT_COUNT }, (_, id) => ({
    id,
    claimed: false,
    token: null,
    sittingOut: false,
    disconnected: false,
  }));
}

/** Seats eligible for the next deal-in: claimed, connected, not voluntarily sitting out. */
function eligibleSeats(room: Room): SeatId[] {
  return room.seats
    .filter((seat) => seat.claimed && !seat.disconnected && !seat.sittingOut)
    .map((seat) => seat.id);
}

/** Resets a seat to its unclaimed default — used by the manual evict action. */
function freeSeat(seat: Seat): void {
  seat.claimed = false;
  seat.token = null;
  seat.sittingOut = false;
  seat.disconnected = false;
}

/**
 * Whether `seatId` reads as "sitting out" to a client: a voluntary opt-out,
 * or a claim that arrived after the room's current ring was fixed and
 * hasn't been swept into a deal-in recompute yet (issue #13). Shared by
 * `toRoomView` and any single-seat lookup that needs the same derivation.
 */
function isSittingOut(room: Room, seatId: SeatId): boolean {
  const seat = room.seats[seatId];
  if (!seat) return false;
  const ring = room.engine?.seats;
  return (
    seat.sittingOut ||
    (seat.claimed &&
      !seat.disconnected &&
      ring !== undefined &&
      !ring.includes(seatId))
  );
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

  create(): Room {
    const code = generateRoomCode((c) => this.#rooms.has(c), this.#random);
    const room: Room = { code, seats: makeSeats(), engine: null };
    this.#rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.#rooms.get(code);
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

  claimSeat(code: string, seatId: SeatId): ClaimSeatResult {
    const room = this.#rooms.get(code);
    if (!room) return { error: "room-not-found" };

    const seat = room.seats[seatId];
    if (!seat) return { error: "seat-not-found" };
    if (seat.claimed) return { error: "seat-already-claimed" };

    seat.claimed = true;
    seat.token = this.#generateToken();
    seat.sittingOut = false;
    seat.disconnected = false;
    return { seat };
  }

  /**
   * Frees any claimed seat — active, sitting-out, or disconnected alike —
   * back into the join picker and invalidates its token. The table
   * device's manual "evict" action (ADR-0003); there is no automatic
   * trigger.
   */
  evictSeat(code: string, seatId: SeatId): void {
    const room = this.#rooms.get(code);
    const seat = room?.seats[seatId];
    if (!seat) return;
    freeSeat(seat);
  }

  /** Whether `seatId` reads as "sitting out" in the room's public view — see `isSittingOut`. */
  isSittingOut(code: string, seatId: SeatId): boolean {
    const room = this.#rooms.get(code);
    return room ? isSittingOut(room, seatId) : false;
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
    if (!seat) return;
    seat.disconnected = disconnected;
  }

  /**
   * Runs one command through the engine on behalf of an authenticated
   * socket. `identity` is derived server-side from the WS connection, never
   * from the message payload — see docs/phase-1-spec.md §6. `startHand` and
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

    if (type === "startHand" && room.engine === null) {
      const dealIn = eligibleSeats(room);
      if (dealIn.length < 2) return { reason: "not-enough-players" };
      room.engine = createInitialState(dealIn);
    } else if (type === "nextHand" && room.engine !== null) {
      const dealIn = eligibleSeats(room);
      if (dealIn.length < 2) return { reason: "not-enough-players" };
      room.engine = {
        ...room.engine,
        seats: dealIn,
        button: resolveButtonFor(room.engine.button, dealIn),
      };
    }

    if (room.engine === null) return { reason: "hand-not-in-progress" };

    const command = this.#buildCommand(identity, type);
    const result = decide(room.engine, command);
    if (!Array.isArray(result)) return { reason: result.reason };

    const steps: DispatchStep[] = [];
    let state = room.engine;
    for (const event of result) {
      state = apply(state, event);
      steps.push({ event, state });
    }
    room.engine = state;

    return { steps };
  }

  /**
   * `playerId` is unused by the engine for `startHand`/`nextHand` (no
   * issuer restriction at that layer, per docs/phase-1-spec.md §3) — the
   * table isn't a seat, so there's no meaningful id to supply; `0` is an
   * arbitrary placeholder.
   */
  #buildCommand(identity: SeatId | "table", type: SeatCommandType): Command {
    if (type === "startHand" || type === "nextHand") {
      return { type, playerId: 0, seed: this.#generateSeed() };
    }
    return { type, playerId: identity as SeatId };
  }
}

/** Public seat/room projection — never carries a seat's claim token. */
export function toRoomView(room: Room): RoomView {
  return {
    code: room.code,
    seats: room.seats.map((seat) => ({
      id: seat.id,
      claimed: seat.claimed,
      sittingOut: isSittingOut(room, seat.id),
      disconnected: seat.disconnected,
    })),
  };
}
